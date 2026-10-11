import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@farmmitra/database';
import { signAccessToken } from './auth.js';
import { sendError } from './http.js';
import { handleApi } from './routes.js';

const prisma = new PrismaClient();

const requestFor = (orderId: string, partnerId: string, key: string) => ({
  method: 'POST',
  url: `/api/v1/marketplace/orders/${orderId}/collect-payment`,
  headers: {
    authorization: `Bearer ${signAccessToken({ userId: partnerId, roles: ['DELIVERY_PARTNER'], permissions: [] })}`,
    'idempotency-key': key,
  },
  async *[Symbol.asyncIterator]() {
    yield Buffer.from(JSON.stringify({ method: 'CASH', amount: 60 }));
  },
});

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
  return { statusCode, payload };
};

test('concurrent payment collection cannot over-collect and remains idempotent', async () => {
  const vendor = await prisma.vendor.findFirstOrThrow({ where: { name: 'Vendor A' } });
  const shop = await prisma.shop.findFirstOrThrow({ where: { isActive: true } });
  const customer = await prisma.user.findFirstOrThrow({ where: { email: 'customer.local@farmmitra.test' } });
  const partner = await prisma.user.findFirstOrThrow({ where: { email: 'rahul.delivery@farmmitra.test' } });
  const orderNumber = `PAYMENT-RACE-${randomUUID()}`;
  const order = await prisma.order.create({
    data: {
      orderNumber,
      shopId: shop.id,
      vendorId: vendor.id,
      customerId: customer.id,
      status: 'OUT_FOR_DELIVERY',
      totalAmount: 60,
      subtotal: 60,
      deliveries: {
        create: {
          shopId: shop.id,
          vendorId: vendor.id,
          status: 'OUT_FOR_DELIVERY',
          deliveryAddress: 'Payment concurrency test',
          assignments: { create: { userId: partner.id, status: 'IN_PROGRESS' } },
        },
      },
    },
  });

  const keys = [`payment-race-a-${order.id}`, `payment-race-b-${order.id}`];

  try {
    await prisma.vendorUser.update({
      where: { userId_vendorId: { userId: partner.id, vendorId: vendor.id } },
      data: { isActive: true, capabilities: ['DELIVERY', 'PAYMENT_COLLECTION'] },
    });

    const attempts = await Promise.all(keys.map((key) => invoke(requestFor(order.id, partner.id, key))));
    const accepted = attempts.filter((attempt) => attempt.statusCode === 201);
    const rejected = attempts.filter((attempt) => attempt.statusCode === 400);
    assert.equal(accepted.length, 1);
    assert.equal(rejected.length, 1);

    const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
    assert.equal(payments.length, 1);
    assert.equal(payments[0]?.status, 'CASH_COLLECTED');
    assert.equal(payments.reduce((total, payment) => total + Number(payment.amount), 0), 60);
    assert.ok(payments.reduce((total, payment) => total + Number(payment.amount), 0) <= Number(order.totalAmount));
    const storedKeys = await prisma.idempotencyKey.findMany({ where: { key: { in: keys } }, select: { key: true } });
    assert.deepEqual(storedKeys.map(({ key }) => key), [keys[attempts.findIndex((attempt) => attempt.statusCode === 201)]]);

    const winningKey = keys[attempts.findIndex((attempt) => attempt.statusCode === 201)]!;
    const replays = await Promise.all([invoke(requestFor(order.id, partner.id, winningKey)), invoke(requestFor(order.id, partner.id, winningKey))]);
    for (const replay of replays) {
      assert.equal(replay.statusCode, 200);
      assert.equal((replay.payload as { idempotent: boolean }).idempotent, true);
      assert.equal((replay.payload as { orderId: string }).orderId, order.id);
      assert.equal((replay.payload as { summary: { outstanding: number } }).summary.outstanding, 0);
    }
    assert.equal(await prisma.payment.count({ where: { orderId: order.id } }), 1);
  } finally {
    await prisma.idempotencyKey.deleteMany({ where: { key: { in: keys } } });
    await prisma.payment.deleteMany({ where: { orderId: order.id } });
    await prisma.delivery.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.$disconnect();
  }
});