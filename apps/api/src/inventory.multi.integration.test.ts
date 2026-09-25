import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@farmmitra/database';
import { signAccessToken } from './auth.js';
import { sendError } from './http.js';
import { handleApi } from './routes.js';

const prisma = new PrismaClient();
const authenticatedRequest = (method: string, url: string, userId: string, roles: string[], permissions: string[], payload: unknown, key = '') => ({
  method,
  url,
  headers: { authorization: `Bearer ${signAccessToken({ userId, roles, permissions })}`, ...(key ? { 'idempotency-key': key } : {}) },
  async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)); },
});
const requestFor = (key: string, customerId: string, addressId: string, items: unknown[]) => authenticatedRequest('POST', '/api/v1/marketplace/orders', customerId, ['CUSTOMER'], ['orders.create'], { addressId, items }, key);
const responseFor = () => {
  let statusCode = 0;
  let payload: any;
  return { response: { writeHead: (status: number) => { statusCode = status; }, end: (body?: string) => { payload = body ? JSON.parse(body) : null; } } as never, read: () => ({ statusCode, payload }) };
};
const invoke = async (request: unknown) => {
  const output = responseFor();
  try { await handleApi(request as never, output.response, prisma); } catch (error) { sendError(output.response, error); }
  return output.read();
};
const checkout = async (key: string, customerId: string, addressId: string, items: unknown[]) => {
  return invoke(requestFor(key, customerId, addressId, items));
};

test('database-backed multi-vendor, variant, rollback, and retry inventory behavior', async () => {
  const vendorA = await prisma.vendor.findFirstOrThrow({ where: { name: 'Vendor A' } });
  const vendorB = await prisma.vendor.findFirstOrThrow({ where: { name: 'Vendor B' } });
  const customer = await prisma.user.findFirstOrThrow({ where: { email: 'customer.local@farmmitra.test' } });
  const vendorBUser = await prisma.user.findFirstOrThrow({ where: { email: 'vendor.b@farmmitra.test' } });
  const deliveryUser = await prisma.user.findFirstOrThrow({ where: { email: 'rahul.delivery@farmmitra.test' } });
  const admin = await prisma.user.findFirstOrThrow({ where: { email: 'admin.local@farmmitra.test' } });
  const category = await prisma.category.findFirstOrThrow({ where: { name: 'Fresh Foods' } });
  const unit = await prisma.unit.findFirstOrThrow({ where: { code: 'KG' } });
  const fixtureSkus = ['PHASE3-MULTI-A', 'PHASE3-MULTI-B', 'PHASE3-ROLLBACK-B', 'PHASE3-VARIANT-A'];
  const staleProducts = await prisma.product.findMany({ where: { sku: { in: fixtureSkus } }, select: { id: true } });
  const staleOrders = await prisma.order.findMany({ where: { items: { some: { productId: { in: staleProducts.map((product) => product.id) } } } }, select: { id: true, masterOrderId: true } });
  await prisma.payment.deleteMany({ where: { orderId: { in: staleOrders.map((order) => order.id) } } });
  await prisma.delivery.deleteMany({ where: { orderId: { in: staleOrders.map((order) => order.id) } } });
  await prisma.order.deleteMany({ where: { id: { in: staleOrders.map((order) => order.id) } } });
  await prisma.masterOrder.deleteMany({ where: { id: { in: staleOrders.flatMap((order) => order.masterOrderId ? [order.masterOrderId] : []) } } });
  await prisma.stockMovement.deleteMany({ where: { productId: { in: staleProducts.map((product) => product.id) } } });
  await prisma.productPrice.deleteMany({ where: { productId: { in: staleProducts.map((product) => product.id) } } });
  await prisma.product.deleteMany({ where: { id: { in: staleProducts.map((product) => product.id) } } });
  await prisma.customerAddress.deleteMany({ where: { userId: customer.id, label: 'Phase 3 multi vendor' } });
  const address = await prisma.customerAddress.create({ data: { userId: customer.id, label: 'Phase 3 multi vendor', line1: 'Test Road', city: 'Test City', state: 'Test State', postalCode: '000000' } });
  const productA = await prisma.product.create({ data: { categoryId: category.id, unitId: unit.id, vendorId: vendorA.id, name: 'Phase 3 Vendor A fixture', sku: 'PHASE3-MULTI-A', stockQuantity: 10 } });
  const productB = await prisma.product.create({ data: { categoryId: category.id, unitId: unit.id, vendorId: vendorB.id, name: 'Phase 3 Vendor B fixture', sku: 'PHASE3-MULTI-B', stockQuantity: 20 } });
  const rollbackProduct = await prisma.product.create({ data: { categoryId: category.id, unitId: unit.id, vendorId: vendorB.id, name: 'Phase 3 rollback fixture', sku: 'PHASE3-ROLLBACK-B', stockQuantity: 1 } });
  const variantProduct = await prisma.product.create({ data: { categoryId: category.id, unitId: unit.id, vendorId: vendorA.id, name: 'Phase 3 variant fixture', sku: 'PHASE3-VARIANT-A', stockQuantity: 99 } });
  const variantA = await prisma.productVariant.create({ data: { productId: variantProduct.id, unitId: unit.id, name: 'Small', sku: 'PHASE3-VARIANT-A-SMALL', stockQuantity: 5 } });
  const variantB = await prisma.productVariant.create({ data: { productId: variantProduct.id, unitId: unit.id, name: 'Large', sku: 'PHASE3-VARIANT-A-LARGE', stockQuantity: 10 } });
  const products = [productA, productB, rollbackProduct, variantProduct];
  const prices = await Promise.all(products.flatMap((product) => [prisma.productPrice.create({ data: { productId: product.id, price: 10, validFrom: new Date() } })]).concat([
    prisma.productPrice.create({ data: { variantId: variantA.id, price: 11, validFrom: new Date(Date.now() + 1) } }),
    prisma.productPrice.create({ data: { variantId: variantB.id, price: 12, validFrom: new Date(Date.now() + 2) } }),
  ]));
  const keys = ['phase3-multi-vendor', 'phase3-variant', 'phase3-variant-fail', 'phase3-rollback'];
  try {
    const multi = await checkout(keys[0], customer.id, address.id, [{ productId: productA.id, quantity: 3 }, { productId: productB.id, quantity: 4 }]);
    assert.equal(multi.statusCode, 201, JSON.stringify(multi.payload));
    assert.equal(multi.payload.subOrders.length, 2);
    assert.deepEqual(new Set(multi.payload.subOrders.map((order: { vendorId: string }) => order.vendorId)), new Set([vendorA.id, vendorB.id]));
    assert.equal(Number((await prisma.product.findUniqueOrThrow({ where: { id: productA.id } })).stockQuantity), 7);
    assert.equal(Number((await prisma.product.findUniqueOrThrow({ where: { id: productB.id } })).stockQuantity), 16);
    assert.equal(await prisma.stockMovement.count({ where: { productId: productA.id, vendorId: vendorA.id, movementType: 'ORDER_DEDUCTION' } }), 1);
    assert.equal(await prisma.stockMovement.count({ where: { productId: productB.id, vendorId: vendorB.id, movementType: 'ORDER_DEDUCTION' } }), 1);
    const retry = await checkout(keys[0], customer.id, address.id, [{ productId: productA.id, quantity: 3 }, { productId: productB.id, quantity: 4 }]);
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.payload.id, multi.payload.id);
    assert.equal(await prisma.stockMovement.count({ where: { referenceId: { in: multi.payload.subOrders.map((order: { id: string }) => order.id) }, movementType: 'ORDER_DEDUCTION' } }), 2);
    const vendorAOrder = multi.payload.subOrders.find((order: { vendorId: string }) => order.vendorId === vendorA.id);
    assert.ok(vendorAOrder);
    const cash = await invoke(authenticatedRequest('POST', `/api/v1/marketplace/orders/${vendorAOrder.id}/collect-payment`, admin.id, ['SUPER_ADMIN'], [], { method: 'CASH', amount: 10 }));
    assert.equal(cash.statusCode, 201);
    const upi = await invoke(authenticatedRequest('POST', `/api/v1/marketplace/orders/${vendorAOrder.id}/collect-payment`, admin.id, ['SUPER_ADMIN'], [], { method: 'UPI', amount: 20, referenceNumber: 'PHASE3-UPI-1' }));
    assert.equal(upi.statusCode, 201);
    assert.equal(Number(upi.payload.summary.outstanding), 0);
    const overCollect = await invoke(authenticatedRequest('POST', `/api/v1/marketplace/orders/${vendorAOrder.id}/collect-payment`, admin.id, ['SUPER_ADMIN'], [], { method: 'CASH', amount: 1 }));
    assert.equal(overCollect.statusCode, 400);
    assert.equal(await prisma.payment.count({ where: { orderId: vendorAOrder.id } }), 2);
    const crossVendorOrder = await invoke(authenticatedRequest('GET', `/api/v1/marketplace/orders/${vendorAOrder.id}`, vendorBUser.id, ['VENDOR'], [], {}));
    assert.equal(crossVendorOrder.statusCode, 403);
    for (const status of ['CONFIRMED', 'PICKING', 'PACKED']) {
      const statusResult = await invoke(authenticatedRequest('POST', `/api/v1/marketplace/orders/${vendorAOrder.id}/status`, admin.id, ['SUPER_ADMIN'], [], { status }));
      assert.equal(statusResult.statusCode, 200);
    }
    const assigned = await invoke(authenticatedRequest('POST', `/api/v1/marketplace/orders/${vendorAOrder.id}/assignment`, admin.id, ['SUPER_ADMIN'], [], { userId: deliveryUser.id }));
    assert.equal(assigned.statusCode, 201);
    assert.equal((await invoke(authenticatedRequest('GET', `/api/v1/marketplace/delivery/orders/${vendorAOrder.id}`, vendorBUser.id, ['VENDOR'], [], {}))).statusCode, 403);
    assert.equal((await invoke(authenticatedRequest('POST', `/api/v1/marketplace/delivery/orders/${vendorAOrder.id}/accept`, deliveryUser.id, ['DELIVERY_PARTNER'], [], {}))).statusCode, 200);
    assert.equal((await invoke(authenticatedRequest('POST', `/api/v1/marketplace/delivery/orders/${vendorAOrder.id}/start`, deliveryUser.id, ['DELIVERY_PARTNER'], [], {}))).statusCode, 200);
    assert.equal((await invoke(authenticatedRequest('POST', `/api/v1/marketplace/delivery/orders/${vendorAOrder.id}/complete`, deliveryUser.id, ['DELIVERY_PARTNER'], [], { payment: 'NOT_RECEIVED' }))).statusCode, 200);
    assert.equal(await prisma.stockMovement.count({ where: { productId: productA.id, movementType: 'ORDER_DEDUCTION' } }), 1);

    const variant = await checkout(keys[1], customer.id, address.id, [{ productId: variantProduct.id, variantId: variantA.id, quantity: 2 }]);
    assert.equal(variant.statusCode, 201);
    assert.equal(Number((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantA.id } })).stockQuantity), 3);
    assert.equal(Number((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantB.id } })).stockQuantity), 10);
    assert.equal(Number((await prisma.product.findUniqueOrThrow({ where: { id: variantProduct.id } })).stockQuantity), 99);
    assert.equal(await prisma.stockMovement.count({ where: { variantId: variantA.id, movementType: 'ORDER_DEDUCTION' } }), 1);
    const insufficientVariant = await checkout(keys[2], customer.id, address.id, [{ productId: variantProduct.id, variantId: variantA.id, quantity: 4 }]);
    assert.equal(insufficientVariant.statusCode, 409);
    assert.equal(Number((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantA.id } })).stockQuantity), 3);

    const rollback = await checkout(keys[3], customer.id, address.id, [{ productId: productA.id, quantity: 1 }, { productId: rollbackProduct.id, quantity: 2 }]);
    assert.equal(rollback.statusCode, 409);
    assert.equal(Number((await prisma.product.findUniqueOrThrow({ where: { id: productA.id } })).stockQuantity), 7);
    assert.equal(await prisma.stockMovement.count({ where: { referenceType: 'ORDER', referenceId: { in: keys }, movementType: 'ORDER_DEDUCTION' } }), 0);
  } finally {
    const orders = await prisma.order.findMany({ where: { items: { some: { productId: { in: products.map((product) => product.id) } } } }, select: { id: true, masterOrderId: true } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orders.map((order) => order.id) } } });
    await prisma.delivery.deleteMany({ where: { orderId: { in: orders.map((order) => order.id) } } });
    await prisma.order.deleteMany({ where: { id: { in: orders.map((order) => order.id) } } });
    await prisma.masterOrder.deleteMany({ where: { id: { in: orders.flatMap((order) => order.masterOrderId ? [order.masterOrderId] : []) } } });
    await prisma.idempotencyKey.deleteMany({ where: { key: { in: keys } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: products.map((product) => product.id) } } });
    await prisma.productPrice.deleteMany({ where: { id: { in: prices.map((price) => price.id) } } });
    await prisma.customerAddress.delete({ where: { id: address.id } });
    await prisma.product.deleteMany({ where: { id: { in: products.map((product) => product.id) } } });
    await prisma.$disconnect();
  }
});
