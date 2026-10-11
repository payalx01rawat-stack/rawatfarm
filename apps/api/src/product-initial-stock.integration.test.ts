import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@farmmitra/database';
import { signAccessToken } from './auth.js';
import { sendError } from './http.js';
import { handleApi } from './routes.js';

const prisma = new PrismaClient();
const requestFor = (method: string, url: string, userId: string, roles: string[], payload?: unknown, idempotencyKey?: string) => {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  return {
    method,
    url,
    headers: {
      authorization: `Bearer ${signAccessToken({ userId, roles, permissions: [] })}`,
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(body);
    },
  };
};

const responseFor = () => {
  let statusCode = 0;
  let payload: unknown;
  return {
    response: {
      writeHead: (status: number) => { statusCode = status; },
      end: (body?: string) => { payload = body ? JSON.parse(body) : null; },
    } as never,
    read: () => ({ statusCode, payload }),
  };
};

const callApi = async (request: ReturnType<typeof requestFor>, response: never) => {
  try {
    await handleApi(request as never, response, prisma);
  } catch (error) {
    sendError(response, error);
  }
};

test('opening stock is persisted, catalogued, orderable, and deducted using the existing inventory ledger', async (t) => {
  const suffix = randomUUID();
  const sku = `QA-OPENING-${suffix}`;
  const checkoutKey = `qa-opening-order-${suffix}`;
  const excessKey = `qa-opening-excess-${suffix}`;
  const zeroKey = `qa-opening-zero-${suffix}`;
  const vendor = await prisma.vendor.findFirstOrThrow({ where: { name: 'Rawat Farm', isActive: true, status: 'APPROVED' } });
  const adminUser = await prisma.user.findFirstOrThrow({ where: { email: 'admin.local@farmmitra.test' } });
  const customer = await prisma.user.findFirstOrThrow({ where: { email: 'customer.local@farmmitra.test' } });
  const category = await prisma.category.findFirstOrThrow({ where: { name: 'Fresh Foods' } });
  const unit = await prisma.unit.findFirstOrThrow({ where: { code: 'KG' } });
  let productId: string | undefined;
  let addressId: string | undefined;
  let masterOrderId: string | undefined;
  let orderId: string | undefined;
  let deliveryId: string | undefined;
  const keys = [checkoutKey, excessKey, zeroKey];

  try {
    const collectionAccess = await prisma.vendorUser.findMany({
      where: { vendorId: vendor.id, isActive: true },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });
    const deliveryCollector = collectionAccess.find((membership) =>
      membership.user.status === 'ACTIVE'
      && Array.isArray(membership.capabilities)
      && membership.capabilities.includes('PAYMENT_COLLECTION')
      && membership.user.roles.some(({ role }) => ['DELIVERY_PARTNER', 'DELIVERY_STAFF'].includes(role.name)));
    assert.ok(deliveryCollector, 'an active Rawat Farm partner with payment-collection capability is required');
    assert.equal(vendor.cashCollectionEnabled, true, 'cash collection must be enabled for this lifecycle test');

    const created = responseFor();
    await callApi(requestFor('POST', '/api/v1/catalog/products', adminUser.id, ['SUPER_ADMIN'], {
      categoryId: category.id,
      unitId: unit.id,
      name: `QA opening stock ${suffix}`,
      sku,
      price: 25,
      initialStockQuantity: 10,
      trackInventory: true,
      status: 'ACTIVE',
    }), created.response);
    assert.equal(created.read().statusCode, 201);
    productId = (created.read().payload as { id: string }).id;

    const persisted = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    assert.equal(Number(persisted.stockQuantity), 10);
    const openingMovement = await prisma.stockMovement.findFirstOrThrow({ where: { productId, movementType: 'INITIAL_STOCK' } });
    assert.equal(Number(openingMovement.quantityDelta), 10);
    assert.equal(Number(openingMovement.stockBefore), 0);
    assert.equal(Number(openingMovement.stockAfter), 10);

    const vendorCatalog = responseFor();
    await callApi(requestFor('GET', `/api/v1/marketplace/vendors/${vendor.id}/products`, adminUser.id, ['SUPER_ADMIN']), vendorCatalog.response);
    const vendorProducts = vendorCatalog.read().payload as Array<{ id: string; stockQuantity: string | number; stockStatus: string }>;
    const vendorProduct = vendorProducts.find((item) => item.id === productId);
    assert.equal(Number(vendorProduct?.stockQuantity), 10);
    assert.equal(vendorProduct?.stockStatus, 'IN_STOCK');

    const customerCatalog = responseFor();
    await callApi(requestFor('GET', '/api/v1/marketplace/products', customer.id, ['CUSTOMER']), customerCatalog.response);
    const customerProducts = customerCatalog.read().payload as Array<{ id: string; stockStatus: string; price: string | number | null }>;
    assert.equal(customerProducts.find((item) => item.id === productId)?.stockStatus, 'IN_STOCK');
    assert.equal(Number(customerProducts.find((item) => item.id === productId)?.price), 25);

    const historyBefore = responseFor();
    await callApi(requestFor('GET', `/api/v1/users/${customer.id}/financial-history`, adminUser.id, ['SUPER_ADMIN']), historyBefore.response);
    assert.equal(historyBefore.read().statusCode, 200);
    const beforeSummary = (historyBefore.read().payload as { summary: { totalOrderValue: number; totalPaid: number; outstanding: number } }).summary;

    const address = await prisma.customerAddress.create({
      data: { userId: customer.id, label: 'Temporary stock QA', line1: 'QA Road', city: 'QA City', state: 'QA State', postalCode: '000000' },
    });
    addressId = address.id;
    const validOrder = responseFor();
    await callApi(requestFor('POST', '/api/v1/marketplace/orders', customer.id, ['CUSTOMER'], {
      addressId,
      items: [{ productId, quantity: 3 }],
    }, checkoutKey), validOrder.response);
    assert.equal(validOrder.read().statusCode, 201);
    const master = validOrder.read().payload as { id: string; subOrders: Array<{ id: string; vendorId: string; totalAmount: number }> };
    masterOrderId = master.id;
    assert.equal(master.subOrders.length, 1);
    assert.equal(master.subOrders[0]?.vendorId, vendor.id);
    orderId = master.subOrders[0]!.id;
    assert.equal(Number(master.subOrders[0]?.totalAmount), 75);
    const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId, productId } });
    assert.deepEqual([Number(orderItem.orderedQuantity), Number(orderItem.unitPrice), Number(orderItem.lineTotal)], [3, 25, 75]);
    assert.equal(Number((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity), 7);
    const deduction = await prisma.stockMovement.findFirstOrThrow({ where: { productId, movementType: 'ORDER_DEDUCTION' } });
    assert.equal(Number(deduction.quantityDelta), -3);
    assert.equal(await prisma.stockMovement.count({ where: { productId, movementType: 'ORDER_DEDUCTION' } }), 1);

    const checkoutReplay = responseFor();
    await callApi(requestFor('POST', '/api/v1/marketplace/orders', customer.id, ['CUSTOMER'], {
      addressId,
      items: [{ productId, quantity: 3 }],
    }, checkoutKey), checkoutReplay.response);
    assert.equal(checkoutReplay.read().statusCode, 200);
    assert.equal((checkoutReplay.read().payload as { id: string }).id, master.id);
    assert.equal(Number((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity), 7);
    assert.equal(await prisma.stockMovement.count({ where: { productId, movementType: 'ORDER_DEDUCTION' } }), 1);

    const vendorOrders = responseFor();
    await callApi(requestFor('GET', `/api/v1/marketplace/vendors/${vendor.id}/orders`, adminUser.id, ['SUPER_ADMIN']), vendorOrders.response);
    assert.equal(vendorOrders.read().statusCode, 200);
    assert.equal(((vendorOrders.read().payload as Array<{ id: string }>).filter((order) => order.id === orderId)).length, 1);
    const differentVendor = await prisma.vendor.findFirstOrThrow({ where: { id: { not: vendor.id } } });
    const otherVendorOrders = responseFor();
    await callApi(requestFor('GET', `/api/v1/marketplace/vendors/${differentVendor.id}/orders`, adminUser.id, ['SUPER_ADMIN']), otherVendorOrders.response);
    assert.equal(otherVendorOrders.read().statusCode, 200);
    assert.equal(((otherVendorOrders.read().payload as Array<{ id: string }>).some((order) => order.id === orderId)), false);

    for (const status of ['CONFIRMED', 'PICKING', 'PACKED']) {
      const processed = responseFor();
      await callApi(requestFor('POST', `/api/v1/marketplace/orders/${orderId}/status`, adminUser.id, ['SUPER_ADMIN'], { status }), processed.response);
      assert.equal(processed.read().statusCode, 200);
    }
    const assignKey = `qa-stock-assignment-${suffix}`;
    keys.push(assignKey);
    const assignment = responseFor();
    await callApi(requestFor('POST', `/api/v1/marketplace/orders/${orderId}/assignment`, adminUser.id, ['SUPER_ADMIN'], { userId: deliveryCollector.userId }, assignKey), assignment.response);
    assert.equal(assignment.read().statusCode, 201);
    deliveryId = (assignment.read().payload as { id: string }).id;

    const accepted = responseFor();
    await callApi(requestFor('POST', `/api/v1/marketplace/delivery/orders/${orderId}/accept`, deliveryCollector.userId, ['DELIVERY_PARTNER'], {}), accepted.response);
    assert.equal(accepted.read().statusCode, 200);
    const started = responseFor();
    await callApi(requestFor('POST', `/api/v1/marketplace/delivery/orders/${orderId}/start`, deliveryCollector.userId, ['DELIVERY_PARTNER'], {}), started.response);
    assert.equal(started.read().statusCode, 200);
    const completionKey = `qa-stock-complete-${suffix}`;
    keys.push(completionKey);
    const completed = responseFor();
    await callApi(requestFor('POST', `/api/v1/marketplace/delivery/orders/${orderId}/complete`, deliveryCollector.userId, ['DELIVERY_PARTNER'], { payment: 'NOT_RECEIVED' }, completionKey), completed.response);
    assert.equal(completed.read().statusCode, 200);
    const completionReplay = responseFor();
    await callApi(requestFor('POST', `/api/v1/marketplace/delivery/orders/${orderId}/complete`, deliveryCollector.userId, ['DELIVERY_PARTNER'], { payment: 'NOT_RECEIVED' }, completionKey), completionReplay.response);
    assert.equal(completionReplay.read().statusCode, 200);
    const delivery = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
    assert.equal(delivery.status, 'DELIVERED');
    assert.equal(delivery.deliveredByUserId, deliveryCollector.userId);

    const collectKey = `qa-stock-cash-${suffix}`;
    keys.push(collectKey);
    const cashInput = { method: 'CASH', amount: 25 };
    const collection = responseFor();
    await callApi(requestFor('POST', `/api/v1/marketplace/orders/${orderId}/collect-payment`, deliveryCollector.userId, ['DELIVERY_PARTNER'], cashInput, collectKey), collection.response);
    assert.equal(collection.read().statusCode, 201);
    assert.equal(Number((collection.read().payload as { summary: { outstanding: number } }).summary.outstanding), 50);
    const collectionReplay = responseFor();
    await callApi(requestFor('POST', `/api/v1/marketplace/orders/${orderId}/collect-payment`, deliveryCollector.userId, ['DELIVERY_PARTNER'], cashInput, collectKey), collectionReplay.response);
    assert.equal(collectionReplay.read().statusCode, 200);
    assert.equal(await prisma.payment.count({ where: { orderId } }), 1);
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
    assert.deepEqual([payment.method, Number(payment.amount), payment.status, payment.receivedByUserId, payment.deliveryPartnerId], ['CASH', 25, 'CASH_COLLECTED', deliveryCollector.userId, deliveryCollector.userId]);

    const cashHandovers = responseFor();
    await callApi(requestFor('GET', '/api/v1/marketplace/admin/cash-handovers', adminUser.id, ['SUPER_ADMIN']), cashHandovers.response);
    assert.equal(cashHandovers.read().statusCode, 200);
    const cashPartner = (cashHandovers.read().payload as { partners: Array<{ id: string; cashCollected: number }> }).partners.find((partner) => partner.id === deliveryCollector.userId);
    assert.ok(cashPartner && Number(cashPartner.cashCollected) >= 25);

    const historyAfter = responseFor();
    await callApi(requestFor('GET', `/api/v1/users/${customer.id}/financial-history`, adminUser.id, ['SUPER_ADMIN']), historyAfter.response);
    assert.equal(historyAfter.read().statusCode, 200);
    const historyPayload = historyAfter.read().payload as {
      summary: { totalOrderValue: number; totalPaid: number; outstanding: number };
      orders: Array<{ id: string; outstanding: number; paymentCollected: number }>;
      payments: Array<{ orderId: string; method: string; amount: number; receivedBy: string | null }>;
    };
    assert.equal(Number(historyPayload.summary.totalOrderValue) - Number(beforeSummary.totalOrderValue), 75);
    assert.equal(Number(historyPayload.summary.totalPaid) - Number(beforeSummary.totalPaid), 25);
    assert.equal(Number(historyPayload.summary.outstanding) - Number(beforeSummary.outstanding), 50);
    assert.equal(Number(historyPayload.orders.find((order) => order.id === orderId)?.outstanding), 50);
    assert.equal(Number(historyPayload.orders.find((order) => order.id === orderId)?.paymentCollected), 25);
    assert.ok(historyPayload.payments.some((entry) => entry.orderId === orderId && entry.method === 'CASH' && Number(entry.amount) === 25 && entry.receivedBy));

    const excessiveOrder = responseFor();
    await callApi(requestFor('POST', '/api/v1/marketplace/orders', customer.id, ['CUSTOMER'], {
      addressId,
      items: [{ productId, quantity: 8 }],
    }, excessKey), excessiveOrder.response);
    assert.equal(excessiveOrder.read().statusCode, 409);
    assert.equal(Number((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity), 7);

    const upiUnavailable = responseFor();
    await callApi(requestFor('POST', `/api/v1/marketplace/orders/${orderId}/collect-payment`, deliveryCollector.userId, ['DELIVERY_PARTNER'], {
      method: 'UPI',
      amount: 1,
    }, `qa-stock-upi-${suffix}`), upiUnavailable.response);
    keys.push(`qa-stock-upi-${suffix}`);
    assert.equal(upiUnavailable.read().statusCode, 400);
    assert.equal(await prisma.payment.count({ where: { orderId } }), 1);

    const adjustedToZero = responseFor();
    await callApi({
      ...requestFor('PATCH', `/api/v1/marketplace/vendors/${vendor.id}/products/${productId}/inventory`, adminUser.id, ['SUPER_ADMIN'], {
        quantity: 7,
        direction: 'DECREASE',
        reason: 'QA zero-stock availability check',
      }),
      method: 'PATCH',
    }, adjustedToZero.response);
    assert.equal(adjustedToZero.read().statusCode, 200);
    const zeroStock = responseFor();
    await callApi(requestFor('GET', '/api/v1/marketplace/products', customer.id, ['CUSTOMER']), zeroStock.response);
    assert.equal((zeroStock.read().payload as Array<{ id: string; stockStatus: string }>).find((item) => item.id === productId)?.stockStatus, 'OUT_OF_STOCK');
    const rejectedAtZero = responseFor();
    await callApi(requestFor('POST', '/api/v1/marketplace/orders', customer.id, ['CUSTOMER'], {
      addressId,
      items: [{ productId, quantity: 1 }],
    }, zeroKey), rejectedAtZero.response);
    assert.equal(rejectedAtZero.read().statusCode, 409);
    t.diagnostic(`Verified opening stock and order deduction for temporary SKU ${sku}`);
  } finally {
    if (productId) {
      const orders = await prisma.order.findMany({ where: { items: { some: { productId } } }, select: { id: true, masterOrderId: true } });
      await prisma.payment.deleteMany({ where: { orderId: { in: orders.map((order) => order.id) } } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orders.map((order) => order.id) } } });
      await prisma.delivery.deleteMany({ where: { orderId: { in: orders.map((order) => order.id) } } });
      await prisma.order.deleteMany({ where: { id: { in: orders.map((order) => order.id) } } });
      await prisma.masterOrder.deleteMany({ where: { id: { in: orders.flatMap((order) => order.masterOrderId ? [order.masterOrderId] : []) } } });
      await prisma.auditLog.deleteMany({ where: { entityType: 'Product', entityId: productId } });
      await prisma.stockMovement.deleteMany({ where: { productId } });
      await prisma.productPrice.deleteMany({ where: { productId } });
      await prisma.product.delete({ where: { id: productId } });
    }
    if (addressId) await prisma.customerAddress.delete({ where: { id: addressId } });
    await prisma.idempotencyKey.deleteMany({ where: { key: { in: keys } } });
    assert.equal(await prisma.product.count({ where: { sku } }), 0);
    assert.equal(await prisma.idempotencyKey.count({ where: { key: { in: keys } } }), 0);
    if (addressId) assert.equal(await prisma.customerAddress.count({ where: { id: addressId } }), 0);
    if (masterOrderId) assert.equal(await prisma.masterOrder.count({ where: { id: masterOrderId } }), 0);
    if (orderId) {
      assert.equal(await prisma.order.count({ where: { id: orderId } }), 0);
      assert.equal(await prisma.payment.count({ where: { orderId } }), 0);
      assert.equal(await prisma.orderStatusHistory.count({ where: { orderId } }), 0);
    }
    if (deliveryId) assert.equal(await prisma.delivery.count({ where: { id: deliveryId } }), 0);
    if (productId) assert.equal(await prisma.stockMovement.count({ where: { productId } }), 0);
    await prisma.$disconnect();
  }
});
