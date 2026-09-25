import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma, PrismaClient } from '@farmmitra/database';
import { signAccessToken } from './auth.js';
import { sendError } from './http.js';
import { handleApi } from './routes.js';

const prisma = new PrismaClient();
const requestFor = (key: string, userId: string, roles: string[], permissions: string[], url: string, payload: unknown) => ({
  method: 'POST',
  url,
  headers: { authorization: `Bearer ${signAccessToken({ userId, roles, permissions })}`, ...(key ? { 'idempotency-key': key } : {}) },
  async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)); },
});

const checkoutRequest = (key: string, customerId: string, addressId: string, productId: string) => requestFor(key, customerId, ['CUSTOMER'], ['orders.create'], '/api/v1/marketplace/orders', { addressId, items: [{ productId, quantity: 3 }] });

const responseFor = () => {
  let statusCode = 0;
  let payload: unknown;
  return {
    response: { writeHead: (status: number) => { statusCode = status; }, end: (body?: string) => { payload = body ? JSON.parse(body) : null; } } as never,
    read: () => ({ statusCode, payload: payload as { subOrders?: Array<{ id: string }>; error?: string } | null }),
  };
};

test('database-backed concurrent marketplace checkout cannot oversell', async (t) => {
  const vendor = await prisma.vendor.findFirstOrThrow({ where: { name: 'Vendor A' } });
  const customer = await prisma.user.findFirstOrThrow({ where: { email: 'customer.local@farmmitra.test' } });
  const category = await prisma.category.findFirstOrThrow({ where: { name: 'Fresh Foods' } });
  const unit = await prisma.unit.findFirstOrThrow({ where: { code: 'KG' } });
  const product = await prisma.product.create({ data: { categoryId: category.id, unitId: unit.id, vendorId: vendor.id, name: 'Phase 3 concurrency fixture', sku: 'PHASE3-CONCURRENCY-FIXTURE', stockQuantity: 5, lowStockThreshold: 1 } });
  const price = await prisma.productPrice.create({ data: { productId: product.id, price: 10, validFrom: new Date() } });
  const address = await prisma.customerAddress.create({ data: { userId: customer.id, label: 'Phase 3 test', line1: 'Test Road', city: 'Test City', state: 'Test State', postalCode: '000000' } });
  const vendorUser = await prisma.user.findFirstOrThrow({ where: { email: 'vendor.a@farmmitra.test' } });
  const vendorBUser = await prisma.user.findFirstOrThrow({ where: { email: 'vendor.b@farmmitra.test' } });
  const deliveryUser = await prisma.user.findFirstOrThrow({ where: { email: 'rahul.delivery@farmmitra.test' } });
  const admin = await prisma.user.findFirstOrThrow({ where: { email: 'admin.local@farmmitra.test' } });
  const keys = ['phase3-concurrency-a', 'phase3-concurrency-b', 'phase3-out-of-stock-race', 'phase3-out-of-stock-after', 'phase3-untracked'];
  await prisma.idempotencyKey.deleteMany({ where: { key: { in: keys } } });
  try {
    const ownInventory = responseFor();
    await handleApi({ ...requestFor('', vendorUser.id, ['VENDOR'], [], `/api/v1/marketplace/vendors/${vendor.id}/products`, {}), method: 'GET' } as never, ownInventory.response, prisma);
    assert.equal(ownInventory.read().statusCode, 200);
    const otherVendor = responseFor();
    try { await handleApi({ ...requestFor('', vendorBUser.id, ['VENDOR'], [], `/api/v1/marketplace/vendors/${vendor.id}/products`, {}), method: 'GET' } as never, otherVendor.response, prisma); } catch (error) { sendError(otherVendor.response, error); }
    assert.equal(otherVendor.read().statusCode, 403);
    const customerMutation = responseFor();
    try { await handleApi({ ...requestFor('', customer.id, ['CUSTOMER'], [], `/api/v1/marketplace/vendors/${vendor.id}/products/${product.id}/inventory`, { quantity: 1, direction: 'INCREASE', reason: 'unauthorized' }), method: 'PATCH' } as never, customerMutation.response, prisma); } catch (error) { sendError(customerMutation.response, error); }
    assert.equal(customerMutation.read().statusCode, 403);
    const deliveryMutation = responseFor();
    try { await handleApi({ ...requestFor('', deliveryUser.id, ['DELIVERY_PARTNER'], [], `/api/v1/marketplace/vendors/${vendor.id}/products/${product.id}/inventory`, { quantity: 1, direction: 'INCREASE', reason: 'unauthorized' }), method: 'PATCH' } as never, deliveryMutation.response, prisma); } catch (error) { sendError(deliveryMutation.response, error); }
    assert.equal(deliveryMutation.read().statusCode, 403);
    const adminInventory = responseFor();
    await handleApi({ ...requestFor('', admin.id, ['SUPER_ADMIN'], ['vendors.manage'], '/api/v1/marketplace/admin/inventory', {}), method: 'GET' } as never, adminInventory.response, prisma);
    assert.equal(adminInventory.read().statusCode, 200);
    const results = await Promise.all(keys.map(async (key) => {
      const output = responseFor();
      try { await handleApi(checkoutRequest(key, customer.id, address.id, product.id) as never, output.response, prisma); } catch (error) { sendError(output.response, error); }
      return output.read();
    }));
    const successful = results.filter((result) => result.statusCode === 201);
    assert.ok(successful.length <= 1);
    const current = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    assert.ok(current.stockQuantity.gte(0));
    assert.ok(current.stockQuantity.gte(new Prisma.Decimal(0)));
    const movements = await prisma.stockMovement.findMany({ where: { productId: product.id, movementType: 'ORDER_DEDUCTION' } });
    assert.equal(movements.reduce((sum, movement) => sum + Number(movement.quantityDelta), 0), Number(current.stockQuantity) - 5);
    const successfulOrderId = successful[0]?.payload?.subOrders?.[0]?.id;
    assert.ok(successfulOrderId);
    const cancellation = responseFor();
    await handleApi(requestFor('', admin.id, ['SUPER_ADMIN'], [], `/api/v1/orders/${successfulOrderId}/cancel`, {}) as never, cancellation.response, prisma);
    assert.equal(cancellation.read().statusCode, 200);
    assert.equal(Number((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity), 5);
    const repeatCancellation = responseFor();
    await handleApi(requestFor('', admin.id, ['SUPER_ADMIN'], [], `/api/v1/orders/${successfulOrderId}/cancel`, {}) as never, repeatCancellation.response, prisma);
    assert.equal(repeatCancellation.read().statusCode, 200);
    assert.equal(await prisma.stockMovement.count({ where: { productId: product.id, movementType: 'ORDER_CANCELLATION' } }), 1);
    const increase = responseFor();
    await handleApi({ ...requestFor('', vendorUser.id, ['VENDOR'], [], `/api/v1/marketplace/vendors/${vendor.id}/products/${product.id}/inventory`, { quantity: 5, direction: 'INCREASE', reason: 'Phase 3 test receipt' }), method: 'PATCH' } as never, increase.response, prisma);
    assert.equal(increase.read().statusCode, 200);
    const decrease = responseFor();
    await handleApi({ ...requestFor('', vendorUser.id, ['VENDOR'], [], `/api/v1/marketplace/vendors/${vendor.id}/products/${product.id}/inventory`, { quantity: 3, direction: 'DECREASE', reason: 'Phase 3 test correction' }), method: 'PATCH' } as never, decrease.response, prisma);
    assert.equal(decrease.read().statusCode, 200);
    assert.equal(Number((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity), 7);
    await prisma.product.update({ where: { id: product.id }, data: { stockQuantity: 0 } });
    const unavailable = responseFor();
    try { await handleApi(checkoutRequest(keys[3], customer.id, address.id, product.id) as never, unavailable.response, prisma); } catch (error) { sendError(unavailable.response, error); }
    assert.equal(unavailable.read().statusCode, 409);
    assert.equal(await prisma.stockMovement.count({ where: { productId: product.id, movementType: 'ORDER_DEDUCTION' } }), 1);
    await prisma.product.update({ where: { id: product.id }, data: { trackInventory: false, stockQuantity: 0 } });
    const untracked = responseFor();
    try { await handleApi(checkoutRequest(keys[4], customer.id, address.id, product.id) as never, untracked.response, prisma); } catch (error) { sendError(untracked.response, error); }
    assert.equal(untracked.read().statusCode, 201);
    assert.equal(await prisma.stockMovement.count({ where: { productId: product.id, movementType: 'ORDER_DEDUCTION' } }), 1);
    t.diagnostic(`concurrent results: ${results.map((result) => result.statusCode).join(', ')}`);
  } finally {
    const orders = await prisma.order.findMany({ where: { items: { some: { productId: product.id } } }, select: { id: true, masterOrderId: true } });
    await prisma.order.deleteMany({ where: { id: { in: orders.map((order) => order.id) } } });
    await prisma.masterOrder.deleteMany({ where: { id: { in: orders.flatMap((order) => order.masterOrderId ? [order.masterOrderId] : []) } } });
    await prisma.idempotencyKey.deleteMany({ where: { key: { in: keys } } });
    await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
    await prisma.productPrice.delete({ where: { id: price.id } });
    await prisma.customerAddress.delete({ where: { id: address.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.$disconnect();
  }
});
