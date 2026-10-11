import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@farmmitra/database';
import { signAccessToken } from './auth.js';
import { sendError } from './http.js';
import { handleApi } from './routes.js';

const prisma = new PrismaClient();
const enabled = process.env.FARMMITRA_RUN_LIVE_PAYMENT_E2E === '1';

const requestFor = (method: string, url: string, userId: string, roles: string[], payload?: unknown, key?: string) => {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  return {
    method,
    url,
    headers: {
      authorization: `Bearer ${signAccessToken({ userId, roles, permissions: [] })}`,
      ...(key ? { 'idempotency-key': key } : {}),
    },
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(body);
    },
  };
};

const invoke = async (request: ReturnType<typeof requestFor>) => {
  let statusCode = 0;
  let payload: unknown;
  const response = {
    writeHead: (status: number) => { statusCode = status; },
    end: (body?: string) => { payload = body ? JSON.parse(body) : null; },
  } as never;
  try {
    await handleApi(request as never, response, prisma);
  } catch (error) {
    sendError(response, error);
  }
  return { statusCode, payload: payload as Record<string, any> | null };
};

test('isolated live payment collection preserves delivery, Khata, collector, and handover state', { skip: !enabled }, async (t) => {
  const fixtureTag = randomUUID();
  const idempotencyKeys: string[] = [];
  const handoverKeys: string[] = [];
  const orderIds: string[] = [];
  const deliveryIds: string[] = [];
  const handoverIds: string[] = [];

  try {
    const vendors = await prisma.vendor.findMany({
      where: { name: 'Rawat Farm' },
      include: {
        users: {
          include: {
            user: { include: { roles: { include: { role: true } } } },
          },
        },
      },
    });
    assert.equal(vendors.length, 1, 'exactly one Rawat Farm vendor must exist');
    const vendor = vendors[0]!;
    assert.equal(vendor.status, 'APPROVED');
    assert.equal(vendor.isActive, true);

    const partners = vendor.users.filter((membership) =>
      membership.isActive
      && membership.user.status === 'ACTIVE'
      && Array.isArray(membership.capabilities)
      && membership.capabilities.includes('PAYMENT_COLLECTION')
      && membership.user.roles.some(({ role }) => ['DELIVERY_PARTNER', 'DELIVERY_STAFF'].includes(role.name)));
    assert.ok(partners.length >= 2, 'two active Rawat Farm payment collectors are required');
    const deliveryPartner = partners[0]!.user;
    const collectingPartner = partners[1]!.user;
    const customer = await prisma.user.findFirstOrThrow({
      where: { email: 'customer.local@farmmitra.test', status: 'ACTIVE', roles: { some: { role: { name: 'CUSTOMER' } } } },
    });
    const admin = await prisma.user.findFirstOrThrow({
      where: { email: 'admin.local@farmmitra.test', status: 'ACTIVE', roles: { some: { role: { name: 'SUPER_ADMIN' } } } },
    });
    const shop = await prisma.shop.findFirstOrThrow({ where: { isActive: true } });
    const otherVendor = await prisma.vendor.findFirst({
      where: { id: { not: vendor.id }, status: 'APPROVED', isActive: true },
    });
    assert.ok(otherVendor, 'an active approved second vendor is required for the cross-vendor check');

    const adminAuth = { userId: admin.id, roles: ['SUPER_ADMIN'] };
    const customerHistoryUrl = `/api/v1/users/${customer.id}/financial-history`;
    const baselineHistory = await invoke(requestFor('GET', customerHistoryUrl, adminAuth.userId, adminAuth.roles));
    assert.equal(baselineHistory.statusCode, 200);
    const baselineOrderValue = Number(baselineHistory.payload?.summary.totalOrderValue);
    const baselinePaid = Number(baselineHistory.payload?.summary.totalPaid);
    const baselineOutstanding = Number(baselineHistory.payload?.summary.outstanding);
    const baselineHandovers = await invoke(requestFor('GET', '/api/v1/marketplace/admin/cash-handovers', adminAuth.userId, adminAuth.roles));
    assert.equal(baselineHandovers.statusCode, 200);
    const partnerHandoverBaseline = baselineHandovers.payload?.partners.find((partner: { id: string }) => partner.id === collectingPartner.id);
    assert.ok(partnerHandoverBaseline);

    const makeOrder = async (orderNumber: string, vendorId: string, totalAmount: number, status: 'PACKED' | 'CONFIRMED') => {
      const order = await prisma.order.create({
        data: {
          orderNumber,
          shopId: shop.id,
          vendorId,
          customerId: customer.id,
          status,
          subtotal: totalAmount,
          totalAmount,
          deliveryAddressSnapshot: `Isolated QA ${fixtureTag}`,
        },
      });
      orderIds.push(order.id);
      return order;
    };
    const keyFor = (purpose: string) => {
      const key = `live-payment-${fixtureTag}-${purpose}`;
      idempotencyKeys.push(key);
      return key;
    };
    const collect = (orderId: string, userId: string, method: 'CASH' | 'UPI', amount: number, purpose: string, referenceNumber?: string) => {
      const key = keyFor(purpose);
      return invoke(requestFor('POST', `/api/v1/marketplace/orders/${orderId}/collect-payment`, userId, ['DELIVERY_PARTNER'], {
        method, amount, ...(referenceNumber ? { referenceNumber } : {}),
      }, key));
    };
    const mainOrder = await makeOrder(`QA-COLLECT-${fixtureTag}`, vendor.id, 100, 'PACKED');

    const assignment = await invoke(requestFor('POST', `/api/v1/marketplace/orders/${mainOrder.id}/assignment`, adminAuth.userId, adminAuth.roles, { userId: deliveryPartner.id }));
    assert.equal(assignment.statusCode, 201, JSON.stringify(assignment.payload));
    const deliveryId = assignment.payload?.id as string;
    deliveryIds.push(deliveryId);

    const accepted = await invoke(requestFor('POST', `/api/v1/marketplace/delivery/orders/${mainOrder.id}/accept`, deliveryPartner.id, ['DELIVERY_PARTNER'], {}));
    assert.equal(accepted.statusCode, 200, JSON.stringify(accepted.payload));
    const started = await invoke(requestFor('POST', `/api/v1/marketplace/delivery/orders/${mainOrder.id}/start`, deliveryPartner.id, ['DELIVERY_PARTNER'], {}));
    assert.equal(started.statusCode, 200, JSON.stringify(started.payload));
    const completed = await invoke(requestFor('POST', `/api/v1/marketplace/delivery/orders/${mainOrder.id}/complete`, deliveryPartner.id, ['DELIVERY_PARTNER'], { payment: 'NOT_RECEIVED' }, keyFor('delivery-complete')));
    assert.equal(completed.statusCode, 200, JSON.stringify(completed.payload));
    const completedDelivery = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
    assert.equal(completedDelivery.status, 'DELIVERED');
    assert.equal(completedDelivery.deliveredByUserId, deliveryPartner.id);

    const firstCash = await collect(mainOrder.id, collectingPartner.id, 'CASH', 30, 'cash-partial');
    assert.equal(firstCash.statusCode, 201, JSON.stringify(firstCash.payload));
    assert.equal(Number(firstCash.payload?.summary.outstanding), 70);
    const collectibleOrders = await invoke(requestFor('GET', '/api/v1/marketplace/delivery/collectible-orders', collectingPartner.id, ['DELIVERY_PARTNER']));
    assert.equal(collectibleOrders.statusCode, 200);
    assert.ok(collectibleOrders.payload?.some((order: { id: string }) => order.id === mainOrder.id));
    const firstPaymentId = firstCash.payload?.payment.id as string;

    const replayKey = idempotencyKeys.find((key) => key.endsWith('-cash-partial'))!;
    const replay = await invoke(requestFor('POST', `/api/v1/marketplace/orders/${mainOrder.id}/collect-payment`, collectingPartner.id, ['DELIVERY_PARTNER'], {
      method: 'CASH', amount: 30,
    }, replayKey));
    assert.equal(replay.statusCode, 200);
    assert.equal(await prisma.payment.count({ where: { orderId: mainOrder.id } }), 1);

    const unauthorized = await invoke(requestFor('POST', `/api/v1/marketplace/orders/${mainOrder.id}/collect-payment`, customer.id, ['CUSTOMER'], {
      method: 'CASH', amount: 1,
    }, keyFor('unauthorized')));
    assert.equal(unauthorized.statusCode, 403);

    const afterPartialHandovers = await invoke(requestFor('GET', '/api/v1/marketplace/admin/cash-handovers', adminAuth.userId, adminAuth.roles));
    assert.equal(afterPartialHandovers.statusCode, 200);
    const afterPartialPartner = afterPartialHandovers.payload?.partners.find((partner: { id: string }) => partner.id === collectingPartner.id);
    assert.equal(Number(afterPartialPartner.cashCollected) - Number(partnerHandoverBaseline.cashCollected), 30);
    const handoverKey = `live-handover-${fixtureTag}`;
    handoverKeys.push(handoverKey);
    const handover = await invoke(requestFor('POST', '/api/v1/marketplace/admin/cash-handovers', adminAuth.userId, adminAuth.roles, {
      deliveryPartnerId: collectingPartner.id,
      amount: 30,
    }, handoverKey));
    assert.equal(handover.statusCode, 201, JSON.stringify(handover.payload));
    handoverIds.push(handover.payload?.id as string);
    assert.equal(await prisma.payment.count({ where: { orderId: mainOrder.id } }), 1, 'cash handover must not create another customer payment');

    const remainderCash = await collect(mainOrder.id, collectingPartner.id, 'CASH', 70, 'cash-remainder');
    assert.equal(remainderCash.statusCode, 201, JSON.stringify(remainderCash.payload));
    assert.equal(Number(remainderCash.payload?.summary.outstanding), 0);

    const unassignedOrder = await makeOrder(`QA-NO-ASSIGN-${fixtureTag}`, vendor.id, 20, 'CONFIRMED');
    const unassignedPayment = await collect(unassignedOrder.id, collectingPartner.id, 'CASH', 20, 'cash-no-assignment');
    assert.equal(unassignedPayment.statusCode, 201, JSON.stringify(unassignedPayment.payload));
    assert.equal(await prisma.delivery.count({ where: { orderId: unassignedOrder.id } }), 0);

    const concurrentOrder = await makeOrder(`QA-CONCURRENT-${fixtureTag}`, vendor.id, 50, 'CONFIRMED');
    const concurrentResults = await Promise.all([
      collect(concurrentOrder.id, collectingPartner.id, 'CASH', 30, 'race-collector-b'),
      collect(concurrentOrder.id, deliveryPartner.id, 'CASH', 30, 'race-collector-a'),
    ]);
    assert.deepEqual(concurrentResults.map((result) => result.statusCode).sort(), [201, 400]);
    const concurrentPayments = await prisma.payment.findMany({ where: { orderId: concurrentOrder.id } });
    assert.equal(concurrentPayments.length, 1);
    assert.equal(concurrentPayments.reduce((sum, payment) => sum + Number(payment.amount), 0), 30);

    const crossVendorOrder = await makeOrder(`QA-CROSS-VENDOR-${fixtureTag}`, otherVendor.id, 10, 'CONFIRMED');
    const crossVendor = await collect(crossVendorOrder.id, collectingPartner.id, 'CASH', 10, 'cross-vendor');
    assert.equal(crossVendor.statusCode, 403);

    const upiAttempt = await collect(mainOrder.id, collectingPartner.id, 'UPI', 1, 'upi-without-real-reference');
    assert.equal(upiAttempt.statusCode, 400, 'UPI requires configured vendor details and a genuine transaction reference');

    const finalHistory = await invoke(requestFor('GET', customerHistoryUrl, adminAuth.userId, adminAuth.roles));
    assert.equal(finalHistory.statusCode, 200);
    assert.equal(Number(finalHistory.payload?.summary.totalOrderValue) - baselineOrderValue, 170);
    assert.equal(Number(finalHistory.payload?.summary.totalPaid) - baselinePaid, 150);
    assert.equal(Number(finalHistory.payload?.summary.outstanding) - baselineOutstanding, 20);
    const mainHistory = finalHistory.payload?.orders.find((order: { id: string }) => order.id === mainOrder.id);
    assert.equal(Number(mainHistory.totalAmount), 100);
    assert.equal(Number(mainHistory.paymentCollected), 100);
    assert.equal(Number(mainHistory.outstanding), 0);
    const mainPayments = await prisma.payment.findMany({ where: { orderId: mainOrder.id } });
    assert.equal(mainPayments.length, 2);
    assert.ok(mainPayments.every((payment) => payment.receivedByUserId === collectingPartner.id && payment.deliveryPartnerId === collectingPartner.id));
    assert.ok(mainPayments.every((payment) => payment.receivedAt instanceof Date));
    assert.ok(mainPayments.some((payment) => payment.id === firstPaymentId && Number(payment.amount) === 30));

    const finalHandovers = await invoke(requestFor('GET', '/api/v1/marketplace/admin/cash-handovers', adminAuth.userId, adminAuth.roles));
    assert.equal(finalHandovers.statusCode, 200);
    const finalPartner = finalHandovers.payload?.partners.find((partner: { id: string }) => partner.id === collectingPartner.id);
    assert.equal(Number(finalPartner.cashCollected) - Number(partnerHandoverBaseline.cashCollected), 150);
    assert.equal(Number(finalPartner.cashHandedOver) - Number(partnerHandoverBaseline.cashHandedOver), 30);
    assert.equal(Number(finalPartner.availableCash) - Number(partnerHandoverBaseline.availableCash), 120);
    assert.equal(finalHandovers.payload?.handovers.filter((entry: { id: string }) => handoverIds.includes(entry.id)).length, 1);
    t.diagnostic(`Verified MySQL row-locking using isolated orders ${orderIds.length}; UPI was rejected without creating a payment because no real UPI reference/configuration was available.`);
  } finally {
    if (handoverKeys.length) await prisma.cashHandover.deleteMany({ where: { idempotencyKey: { in: handoverKeys } } });
    if (handoverIds.length) await prisma.cashHandover.deleteMany({ where: { id: { in: handoverIds } } });
    if (idempotencyKeys.length) await prisma.idempotencyKey.deleteMany({ where: { key: { in: idempotencyKeys } } });
    if (orderIds.length) {
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.delivery.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    const [remainingOrders, remainingPayments, remainingDeliveries, remainingHistory, remainingKeys, remainingHandovers] = await Promise.all([
      orderIds.length ? prisma.order.count({ where: { id: { in: orderIds } } }) : 0,
      orderIds.length ? prisma.payment.count({ where: { orderId: { in: orderIds } } }) : 0,
      orderIds.length ? prisma.delivery.count({ where: { orderId: { in: orderIds } } }) : 0,
      orderIds.length ? prisma.orderStatusHistory.count({ where: { orderId: { in: orderIds } } }) : 0,
      idempotencyKeys.length ? prisma.idempotencyKey.count({ where: { key: { in: idempotencyKeys } } }) : 0,
      handoverKeys.length ? prisma.cashHandover.count({ where: { idempotencyKey: { in: handoverKeys } } }) : 0,
    ]);
    assert.deepEqual([remainingOrders, remainingPayments, remainingDeliveries, remainingHistory, remainingKeys, remainingHandovers], [0, 0, 0, 0, 0, 0], 'all isolated payment E2E fixture records must be cleaned up');
    await prisma.$disconnect();
  }
});
