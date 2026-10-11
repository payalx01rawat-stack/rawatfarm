import assert from 'node:assert/strict';
import test from 'node:test';
import type { ServerResponse } from 'node:http';
import { signAccessToken } from './auth.js';
import { sendError } from './http.js';
import { handleApi } from './routes.js';
import { adminProductCreateSchema, productSchema, vendorProductCreateSchema, vendorSettingsSchema } from './schemas.js';

type RoleName = 'VENDOR' | 'CUSTOMER' | 'SUPER_ADMIN' | 'DELIVERY_PARTNER';

type RouteUser = {
  id: string;
  roles: RoleName[];
};

const userRecord = (user: RouteUser) => ({
  id: user.id,
  status: 'ACTIVE',
  roles: user.roles.map((name) => ({ role: { name, permissions: [] } })),
});

const requestFor = (method: string, url: string, token: string, payload?: unknown, idempotencyKey?: string) => {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  return {
    method,
    url,
    headers: { ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}), authorization: `Bearer ${token}` },
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(body);
    },
  } as never;
};

const responseFor = () => {
  let statusCode = 0;
  let payload = '';
  const response = {
    writeHead: (status: number) => { statusCode = status; },
    end: (body?: string) => { payload = body ?? ''; },
  } as unknown as ServerResponse;
  return {
    response,
    read: () => ({ statusCode, payload: payload ? JSON.parse(payload) as Record<string, unknown> : null }),
  };
};

const tokenFor = (user: RouteUser) => signAccessToken({ userId: user.id, roles: user.roles, permissions: [] });

const callApi = async (request: never, response: ServerResponse, database: unknown): Promise<void> => {
  try {
    await handleApi(request, response, database as never);
  } catch (error) {
    sendError(response, error);
  }
};

const databaseFor = (user: RouteUser, vendorId: string, overrides: Record<string, unknown> = {}) => ({
  user: { findUnique: async () => userRecord(user) },
  vendorUser: { findFirst: async () => ({ vendorId }) },
  vendor: {
    findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, name: 'Rawat Farm', upiId: 'vendora@upi', upiCollectionEnabled: true }),
    update: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'vendor-a', name: 'Vendor A', ...data }),
  },
  product: {
    findFirst: async () => ({ id: 'product-a', vendorId: 'vendor-a' }),
    update: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'product-a', ...data }),
  },
  ...overrides,
}) as never;

test('vendor owner can update complete settings and image URL', async () => {
  const vendor = { id: 'vendor-a', roles: ['VENDOR'] as RoleName[] };
  const settings = {
    name: 'Vendor A Fresh Foods',
    imageUrl: 'https://images.example/vendor-a.png',
    contactPhone: '9999999999',
    contactEmail: 'vendor-a@example.com',
    address: 'Market Road',
    upiId: 'vendora@upi',
    upiAccountLast4: '4826',
    paymentDisplayName: 'Vendor A Payments',
    qrImageUrl: 'https://images.example/vendor-a-qr.png',
    cashCollectionEnabled: true,
    upiCollectionEnabled: false,
    paymentInstructions: 'Pay at delivery',
  };
  const output = responseFor();
  await callApi(requestFor('PATCH', '/api/v1/marketplace/vendors/vendor-a/payment-settings', tokenFor(vendor), settings), output.response, databaseFor(vendor, 'vendor-a'));
  const result = output.read();
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.payload, { id: 'vendor-a', ...settings });
});

test('vendor payment settings validate and persist UPI ID and separate account last four digits', async () => {
  const owner = { id: 'vendor-owner', roles: ['VENDOR'] as RoleName[] };
  let persisted: Record<string, unknown> = {
    id: 'vendor-a',
    name: 'Rawat Farm',
    upiId: null,
    upiAccountLast4: null,
    upiCollectionEnabled: false,
    cashCollectionEnabled: true,
  };
  const database = {
    user: { findUnique: async () => userRecord(owner) },
    vendorUser: {
      findFirst: async () => ({ vendorId: 'vendor-a', isActive: true, vendor: { id: 'vendor-a', status: 'APPROVED', isActive: true } }),
    },
    vendor: {
      findUnique: async () => persisted,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        persisted = { ...persisted, ...data };
        return persisted;
      },
    },
  };
  const valid = { upiId: 'rawat.farm@okaxis', upiAccountLast4: '4826', upiCollectionEnabled: true };
  assert.equal(vendorSettingsSchema.safeParse(valid).success, true);
  assert.equal(vendorSettingsSchema.safeParse({ upiId: 'not-a-vpa', upiAccountLast4: '4826' }).success, false);
  for (const invalidDigits of ['123', '12345', '12a4', '１２３４']) {
    assert.equal(vendorSettingsSchema.safeParse({ upiId: 'rawat@okaxis', upiAccountLast4: invalidDigits }).success, false);
  }

  const output = responseFor();
  await callApi(requestFor('PATCH', '/api/v1/marketplace/vendors/vendor-a/payment-settings', tokenFor(owner), valid), output.response, database);
  const result = output.read();
  assert.equal(result.statusCode, 200);
  assert.equal(persisted.upiId, valid.upiId);
  assert.equal(persisted.upiAccountLast4, valid.upiAccountLast4);
  assert.equal((result.payload as { upiAccountLast4: string }).upiAccountLast4, '4826');

  const readOutput = responseFor();
  await callApi(requestFor('GET', '/api/v1/marketplace/vendors/vendor-a/payment-settings', tokenFor(owner)), readOutput.response, database);
  assert.equal(readOutput.read().statusCode, 200);
  assert.equal((readOutput.read().payload as { upiAccountLast4: string }).upiAccountLast4, '4826');

  persisted = { ...persisted, upiId: null, upiCollectionEnabled: true };
  const unavailableOutput = responseFor();
  await callApi(requestFor('GET', '/api/v1/marketplace/vendors/vendor-a/payment-settings', tokenFor(owner)), unavailableOutput.response, database);
  assert.equal((unavailableOutput.read().payload as { upiCollectionEnabled: boolean }).upiCollectionEnabled, false);

  const noVpaOutput = responseFor();
  persisted = { ...persisted, upiId: null, upiCollectionEnabled: false };
  await callApi(requestFor('PATCH', '/api/v1/marketplace/vendors/vendor-a/payment-settings', tokenFor(owner), { upiCollectionEnabled: true }), noVpaOutput.response, database);
  assert.equal(noVpaOutput.read().statusCode, 400);
  assert.equal(persisted.upiCollectionEnabled, false);

  const invalidUpiOutput = responseFor();
  await callApi(requestFor('PATCH', '/api/v1/marketplace/vendors/vendor-a/payment-settings', tokenFor(owner), { upiId: 'invalid', upiCollectionEnabled: true }), invalidUpiOutput.response, database);
  assert.equal(invalidUpiOutput.read().statusCode, 400);
});

test('vendor account last four digits are redacted outside authorized payment settings', async () => {
  const database = {
    vendor: { findMany: async () => [{ id: 'vendor-a', name: 'Rawat Farm', upiId: 'rawat@okaxis', upiAccountLast4: '4826' }] },
  };
  const output = responseFor();
  await callApi(requestFor('GET', '/api/v1/marketplace/vendors', '', undefined), output.response, database);
  assert.equal(output.read().statusCode, 200);
  assert.equal(JSON.stringify(output.read().payload).includes('4826'), false);
});

test('vendor B cannot update vendor A settings', async () => {
  const vendorB = { id: 'vendor-b-user', roles: ['VENDOR'] as RoleName[] };
  const output = responseFor();
  await callApi(requestFor('PATCH', '/api/v1/marketplace/vendors/vendor-a/payment-settings', tokenFor(vendorB), { name: 'Hijacked Vendor' }), output.response, databaseFor(vendorB, 'vendor-b'));
  assert.equal(output.read().statusCode, 403);
});

test('customer cannot update vendor settings', async () => {
  const customer = { id: 'customer-a', roles: ['CUSTOMER'] as RoleName[] };
  const output = responseFor();
  await callApi(requestFor('PATCH', '/api/v1/marketplace/vendors/vendor-a/payment-settings', tokenFor(customer), { name: 'Unauthorized' }), output.response, databaseFor(customer, 'vendor-a'));
  assert.equal(output.read().statusCode, 403);
  const readOutput = responseFor();
  await callApi(requestFor('GET', '/api/v1/marketplace/vendors/vendor-a/payment-settings', tokenFor(customer)), readOutput.response, databaseFor(customer, 'vendor-a'));
  assert.equal(readOutput.read().statusCode, 403);
});

test('an unassigned Rawat Farm partner may partially collect after another partner has delivered', async () => {
  const partner = { id: 'delivery-b', roles: ['DELIVERY_PARTNER'] as RoleName[] };
  const order = {
    id: 'order-a',
    vendorId: 'vendor-a',
    shopId: 'shop-a',
    totalAmount: 40,
    orderDate: new Date(),
    status: 'DELIVERED',
    payments: [],
    deliveries: [{ id: 'delivery-a', status: 'DELIVERED', deliveredByUserId: 'delivery-a-user', assignments: [{ userId: 'delivery-a-user' }] }],
  };
  const vendor: { id: string; name: string; status: string; isActive: boolean; upiId: string | null; upiCollectionEnabled: boolean; cashCollectionEnabled: boolean } = { id: 'vendor-a', name: 'Rawat Farm', status: 'APPROVED', isActive: true, upiId: 'rawat@upi', upiCollectionEnabled: true, cashCollectionEnabled: true };
  let createdPayment: Record<string, unknown> | undefined;
  const payments: Record<string, unknown>[] = [];
  const idempotencyKeys = new Map<string, { userId: string; requestHash: string }>();
  const paymentTransaction = {
    $queryRaw: async () => [],
    idempotencyKey: {
      findUnique: async ({ where }: { where: { key: string } }) => idempotencyKeys.get(where.key) ?? null,
      create: async ({ data }: { data: { key: string; userId: string; requestHash: string } }) => { idempotencyKeys.set(data.key, data); return data; },
    },
    payment: {
      findMany: async () => [...payments],
      create: async ({ data }: { data: Record<string, unknown> }) => { createdPayment = { id: `payment-${payments.length + 1}`, ...data }; payments.push(createdPayment); return createdPayment; },
    },
  };
  const makeDatabase = (capabilities: string[], paymentVendor = vendor, assignedToOtherPartner = true, partnerAuthorized = true, orderVendorId = order.vendorId) => ({
    user: { findUnique: async () => userRecord(partner) },
    order: { findUnique: async () => ({ ...order, vendorId: orderVendorId, deliveries: assignedToOtherPartner ? order.deliveries : [], vendor: paymentVendor }) },
    delivery: { findFirst: async () => { throw new Error('Payment collection must not require a delivery assignment'); } },
    vendorUser: { findUnique: async () => partnerAuthorized ? ({ isActive: true, capabilities }) : null },
    $transaction: async (callback: (tx: typeof paymentTransaction) => Promise<unknown>) => callback(paymentTransaction),
  });
  let requestIndex = 0;
  const collectUpi = async (database: unknown, amount = 20, key = `collect-test-${++requestIndex}`) => {
    const output = responseFor();
    await callApi(requestFor('POST', '/api/v1/marketplace/orders/order-a/collect-payment', tokenFor(partner), { method: 'UPI', amount, referenceNumber: 'UPI-REF-1' }, key), output.response, database);
    return output.read();
  };

  const missingCapability = await collectUpi(makeDatabase(['DELIVERY']));
  assert.equal(missingCapability.statusCode, 403);

  const disabledUpi = await collectUpi(makeDatabase(['DELIVERY', 'PAYMENT_COLLECTION'], { ...vendor, upiCollectionEnabled: false }));
  assert.equal(disabledUpi.statusCode, 400);

  const missingUpiId = await collectUpi(makeDatabase(['DELIVERY', 'PAYMENT_COLLECTION'], { ...vendor, upiId: null }));
  assert.equal(missingUpiId.statusCode, 400);
  const invalidUpiId = await collectUpi(makeDatabase(['DELIVERY', 'PAYMENT_COLLECTION'], { ...vendor, upiId: 'not-a-vpa' }));
  assert.equal(invalidUpiId.statusCode, 400);

  const validCollection = await collectUpi(makeDatabase(['DELIVERY', 'PAYMENT_COLLECTION']));
  assert.equal(validCollection.statusCode, 201);
  assert.equal((createdPayment as { status: string }).status, 'UPI_COLLECTED');
  assert.equal((createdPayment as { receivedByUserId: string }).receivedByUserId, partner.id);
  assert.equal((createdPayment as { deliveryPartnerId: string }).deliveryPartnerId, partner.id);
  assert.equal((validCollection.payload as { summary: { outstanding: number } }).summary.outstanding, 20);
  assert.equal((createdPayment as { referenceNumber: string }).referenceNumber, 'UPI-REF-1');

  const replayKey = `collect-test-${requestIndex}`;
  const replay = await collectUpi(makeDatabase(['DELIVERY', 'PAYMENT_COLLECTION']), 20, replayKey);
  assert.equal(replay.statusCode, 200);
  assert.equal(payments.length, 1);

  const noAssignmentOrderDb = makeDatabase(['DELIVERY', 'PAYMENT_COLLECTION'], vendor, false);
  const noAssignmentResponse = await collectUpi(noAssignmentOrderDb, 20, 'collect-no-assignment');
  assert.equal(noAssignmentResponse.statusCode, 201);
  assert.equal(payments.length, 2);

  const unauthorized = { id: 'customer-a', roles: ['CUSTOMER'] as RoleName[] };
  const unauthorizedDatabase = { ...makeDatabase(['DELIVERY', 'PAYMENT_COLLECTION']), user: { findUnique: async () => userRecord(unauthorized) } };
  const unauthorizedResponse = responseFor();
  await callApi(requestFor('POST', '/api/v1/marketplace/orders/order-a/collect-payment', tokenFor(unauthorized), { method: 'CASH', amount: 1 }, 'collect-unauthorized'), unauthorizedResponse.response, unauthorizedDatabase);
  assert.equal(unauthorizedResponse.read().statusCode, 403);

  const crossVendorVendor = { ...vendor, id: 'vendor-b', name: 'Vendor B' };
  const crossVendor = await collectUpi(makeDatabase(['DELIVERY', 'PAYMENT_COLLECTION'], crossVendorVendor, true, true, 'vendor-b'), 1, 'collect-cross-vendor');
  assert.equal(crossVendor.statusCode, 403);
});

test('collectible-order lookup is limited to authorized partners and returns current outstanding balance', async () => {
  const partner = { id: 'delivery-b', roles: ['DELIVERY_PARTNER'] as RoleName[] };
  let queriedVendorId = '';
  let orderQuery: Record<string, unknown> | undefined;
  const database = {
    user: { findUnique: async () => userRecord(partner) },
    vendor: { findMany: async () => [{ id: 'rawat-vendor' }] },
    vendorUser: { findUnique: async () => ({ isActive: true, capabilities: ['PAYMENT_COLLECTION'] }) },
    order: {
      findMany: async (args: Record<string, unknown>) => {
        orderQuery = args;
        queriedVendorId = (args.where as { vendorId: string }).vendorId;
        return [{
          id: 'order-rawat',
          vendorId: queriedVendorId,
          orderNumber: 'RF-ORDER-1',
          orderDate: new Date('2025-02-01T10:00:00Z'),
          totalAmount: 100,
          status: 'DELIVERED',
          payments: [{ id: 'payment-1', amount: 40, method: 'CASH', status: 'CASH_COLLECTED', receivedAt: new Date() }],
        }];
      },
    },
  };
  const output = responseFor();
  await callApi(requestFor('GET', '/api/v1/marketplace/delivery/collectible-orders', tokenFor(partner)), output.response, database);
  const result = output.read();
  assert.equal(result.statusCode, 200);
  assert.equal(queriedVendorId, 'rawat-vendor');
  assert.deepEqual((orderQuery?.where as Record<string, unknown>).status, { not: 'CANCELLED' });
  assert.ok(Array.isArray(result.payload));
  assert.equal((result.payload[0] as { paymentSummary: { outstanding: number } }).paymentSummary.outstanding, 60);

  const unauthorized = { id: 'customer-a', roles: ['CUSTOMER'] as RoleName[] };
  const unauthorizedDatabase = { ...database, user: { findUnique: async () => userRecord(unauthorized) } };
  const denied = responseFor();
  await callApi(requestFor('GET', '/api/v1/marketplace/delivery/collectible-orders', tokenFor(unauthorized)), denied.response, unauthorizedDatabase);
  assert.equal(denied.read().statusCode, 403);
});

test('concurrent partial collections with distinct keys cannot exceed the locked outstanding balance', async () => {
  const partner = { id: 'delivery-concurrent', roles: ['DELIVERY_PARTNER'] as RoleName[] };
  const payments: Record<string, unknown>[] = [];
  const keys = new Map<string, { userId: string; requestHash: string }>();
  let transactionTail = Promise.resolve();
  const tx = {
    $queryRaw: async () => [],
    idempotencyKey: {
      findUnique: async ({ where }: { where: { key: string } }) => keys.get(where.key) ?? null,
      create: async ({ data }: { data: { key: string; userId: string; requestHash: string } }) => { keys.set(data.key, data); return data; },
    },
    payment: {
      findMany: async () => [...payments],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const payment = { id: `payment-${payments.length + 1}`, ...data };
        payments.push(payment);
        return payment;
      },
    },
  };
  const database = {
    user: { findUnique: async () => userRecord(partner) },
    order: { findUnique: async () => ({
      id: 'concurrent-order',
      vendorId: 'rawat-vendor',
      shopId: 'shop-a',
      totalAmount: 100,
      orderDate: new Date(),
      status: 'DELIVERED',
      payments: [],
      vendor: { id: 'rawat-vendor', name: 'Rawat Farm', status: 'APPROVED', isActive: true, cashCollectionEnabled: true },
      deliveries: [],
    }) },
    vendorUser: { findUnique: async () => ({ isActive: true, capabilities: ['PAYMENT_COLLECTION'] }) },
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      let release = () => {};
      const current = new Promise<void>((resolve) => { release = resolve; });
      const previous = transactionTail;
      transactionTail = previous.then(() => current);
      await previous;
      try {
        return await callback(tx);
      } finally {
        release();
      }
    },
  };
  const collect = async (key: string) => {
    const output = responseFor();
    await callApi(requestFor('POST', '/api/v1/marketplace/orders/concurrent-order/collect-payment', tokenFor(partner), { method: 'CASH', amount: 60 }, key), output.response, database);
    return output.read();
  };

  const results = await Promise.all([collect('concurrent-collect-a'), collect('concurrent-collect-b')]);
  assert.deepEqual(results.map((result) => result.statusCode).sort(), [201, 400]);
  assert.equal(payments.length, 1);
  assert.equal(Number(payments[0]?.amount), 60);
  assert.equal(payments[0]?.method, 'CASH');
  assert.equal(payments[0]?.status, 'CASH_COLLECTED');
  assert.equal(payments[0]?.receivedByUserId, partner.id);
  assert.equal(payments[0]?.deliveryPartnerId, partner.id);
});

test('vendor product creation preserves stock management without setting an admin-controlled base rate', async () => {
  const vendor = { id: 'vendor-a-user', roles: ['VENDOR'] as RoleName[] };
  const created: { product?: Record<string, unknown>; movement?: Record<string, unknown> } = {};
  const transaction = {
    product: { create: async ({ data }: { data: Record<string, unknown> }) => { created.product = data; return { id: 'product-new', ...data }; } },
    stockMovement: { create: async ({ data }: { data: Record<string, unknown> }) => { created.movement = data; return { id: 'movement-new', ...data }; } },
  };
  const database = {
    ...(databaseFor(vendor, 'vendor-a', { auditLog: { create: async () => undefined } }) as unknown as Record<string, unknown>),
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as never;
  const input = { categoryId: 'cmg1234567890abc', unitId: 'cmg1234567890abd', name: 'Vendor added product', sku: 'VENDOR-NEW-1', initialStockQuantity: 10 };
  const output = responseFor();
  await callApi(requestFor('POST', '/api/v1/marketplace/vendors/vendor-a/products', tokenFor(vendor), input), output.response, database);

  assert.equal(output.read().statusCode, 201);
  assert.equal(created.product?.vendorId, 'vendor-a');
  assert.equal(created.product?.name, input.name);
  assert.equal(created.product?.stockQuantity, 10);
  assert.equal('price' in (created.product ?? {}), false);
  const legacyPrice = responseFor();
  await callApi(requestFor('POST', '/api/v1/marketplace/vendors/vendor-a/products', tokenFor(vendor), { ...input, sku: 'VENDOR-NEW-2', price: 280 }), legacyPrice.response, database);
  assert.equal(legacyPrice.read().statusCode, 400);
  assert.deepEqual(created.movement, {
    vendorId: 'vendor-a',
    productId: 'product-new',
    quantityDelta: 10,
    movementType: 'INITIAL_STOCK',
    reason: 'Opening stock at product creation',
    stockBefore: 0,
    stockAfter: 10,
    createdByUserId: vendor.id,
  });
});

test('product creation validates opening stock and defines disabled inventory behavior', () => {
  const product = { categoryId: 'cmg1234567890abc', unitId: 'cmg1234567890abd', name: 'Fresh Eggs', sku: 'EGGS-OPENING' };
  assert.equal(vendorProductCreateSchema.safeParse({ ...product, initialStockQuantity: 10 }).success, true);
  assert.equal(vendorProductCreateSchema.safeParse({ ...product, initialStockQuantity: 0 }).success, true);
  assert.equal(vendorProductCreateSchema.safeParse({ ...product, initialStockQuantity: -1 }).success, false);
  assert.equal(vendorProductCreateSchema.safeParse({ ...product, price: 10, initialStockQuantity: 0 }).success, false);
  assert.equal(adminProductCreateSchema.safeParse({ ...product, price: 10, trackInventory: false, initialStockQuantity: 0 }).success, true);
  assert.equal(adminProductCreateSchema.safeParse({ ...product, price: 10, trackInventory: false, initialStockQuantity: 10 }).success, false);
});

test('vendor B cannot adjust vendor A stock', async () => {
  const vendorB = { id: 'vendor-b-user', roles: ['VENDOR'] as RoleName[] };
  const output = responseFor();
  await callApi(requestFor('PATCH', '/api/v1/marketplace/vendors/vendor-a/products/product-a/inventory', tokenFor(vendorB), {
    quantity: 4,
    direction: 'INCREASE',
    reason: 'cross-vendor attempt',
  }), output.response, databaseFor(vendorB, 'vendor-b'));
  assert.equal(output.read().statusCode, 403);
});

test('customer catalog reports persisted tracked and untracked stock availability', async () => {
  const products = [
    { id: 'in-stock', name: 'Available', stockQuantity: 10, lowStockThreshold: 2, trackInventory: true, variants: [], vendor: {}, category: {}, unit: {}, sku: 'AVAILABLE' },
    { id: 'zero-stock', name: 'Unavailable', stockQuantity: 0, lowStockThreshold: 2, trackInventory: true, variants: [], vendor: {}, category: {}, unit: {}, sku: 'UNAVAILABLE' },
    { id: 'untracked', name: 'Not tracked', stockQuantity: 0, lowStockThreshold: 2, trackInventory: false, variants: [], vendor: {}, category: {}, unit: {}, sku: 'UNTRACKED' },
  ];
  const database = {
    user: { findUnique: async () => userRecord({ id: 'customer-a', roles: ['CUSTOMER'] }) },
    product: { findMany: async () => products },
    customerProductPrice: { findFirst: async () => null },
    productPrice: { findFirst: async ({ where }: { where: { productId: string } }) => ({ price: where.productId === 'in-stock' ? 25 : 10 }) },
    vendorCustomerPricingRule: { findUnique: async () => null },
  };
  const output = responseFor();
  await callApi(requestFor('GET', '/api/v1/marketplace/products', tokenFor({ id: 'customer-a', roles: ['CUSTOMER'] }), undefined), output.response, database);
  const payload = output.read().payload;
  assert.ok(Array.isArray(payload));
  assert.equal(output.read().statusCode, 200);
  assert.equal(payload.find((product) => product.id === 'in-stock')?.stockStatus, 'IN_STOCK');
  assert.equal(payload.find((product) => product.id === 'zero-stock')?.stockStatus, 'OUT_OF_STOCK');
  assert.equal(payload.find((product) => product.id === 'untracked')?.stockStatus, 'NOT_TRACKED');
});

test('vendor owner can update and clear its product image URL', async () => {
  const vendor = { id: 'vendor-a-user', roles: ['VENDOR'] as RoleName[] };
  const database = databaseFor(vendor, 'vendor-a') as unknown as { product: { update: (args: { data: Record<string, unknown> }) => Promise<unknown> } };
  const update = database.product.update as (args: { data: Record<string, unknown> }) => Promise<unknown>;
  const calls: unknown[] = [];
  database.product.update = async (args: { data: Record<string, unknown> }) => { calls.push(args.data); return update(args); };

  const setOutput = responseFor();
  await callApi(requestFor('PATCH', '/api/v1/marketplace/vendors/vendor-a/products/product-a', tokenFor(vendor), { imageUrl: 'https://images.example/product-a.png' }), setOutput.response, database);
  assert.equal(setOutput.read().statusCode, 200);

  const clearOutput = responseFor();
  await callApi(requestFor('PATCH', '/api/v1/marketplace/vendors/vendor-a/products/product-a', tokenFor(vendor), { imageUrl: null }), clearOutput.response, database);
  assert.equal(clearOutput.read().statusCode, 200);
  assert.deepEqual(calls, [{ imageUrl: 'https://images.example/product-a.png' }, { imageUrl: null }]);
});

test('vendor B and customers cannot update vendor A product images', async () => {
  for (const attacker of [
    { id: 'vendor-b-user', roles: ['VENDOR'] as RoleName[] },
    { id: 'customer-a', roles: ['CUSTOMER'] as RoleName[] },
  ] satisfies RouteUser[]) {
    const output = responseFor();
    await callApi(requestFor('PATCH', '/api/v1/marketplace/vendors/vendor-a/products/product-a', tokenFor(attacker), { imageUrl: 'https://images.example/attack.png' }), output.response, databaseFor(attacker, attacker.roles[0] === 'VENDOR' ? 'vendor-b' : 'vendor-a'));
    assert.equal(output.read().statusCode, 403);
  }
});

test('product image URL is optional for catalog products', () => {
  const withImage = productSchema.safeParse({ categoryId: 'cmg1234567890abc', unitId: 'cmg1234567890abd', name: 'Fresh Chicken', sku: 'CHICKEN-A', imageUrl: 'https://images.example/chicken.png' });
  const withoutImage = productSchema.safeParse({ categoryId: 'cmg1234567890abc', unitId: 'cmg1234567890abd', name: 'Fresh Mutton', sku: 'MUTTON-B', imageUrl: null });
  assert.equal(withImage.success, true);
  assert.equal(withoutImage.success, true);
});

test('super admin can create a pending vendor with a linked vendor owner', async () => {
  const admin = { id: 'admin-a', roles: ['SUPER_ADMIN'] as RoleName[] };
  const created: Record<string, unknown> = {};
  const transaction = {
    user: { create: async ({ data }: { data: Record<string, any> }) => { created.user = data; return { id: 'owner-a', name: data.name, email: data.email, mobile: data.mobile }; } },
    vendor: { create: async ({ data }: { data: Record<string, any> }) => { created.vendor = data; return { id: 'vendor-new', ...data }; } },
    vendorUser: { create: async ({ data }: { data: Record<string, any> }) => { created.vendorUser = data; return data; } },
  };
  const database = {
    user: { findUnique: async () => userRecord(admin), findFirst: async () => null },
    role: { findUnique: async () => ({ id: 'role-vendor' }) },
    auditLog: { create: async () => undefined },
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as never;
  const output = responseFor();
  await callApi(requestFor('POST', '/api/v1/marketplace/admin/vendors', tokenFor(admin), { businessName: 'New Foods', ownerName: 'New Owner', email: 'owner@new.test', phone: '9999999999', address: 'New Road', password: 'SecureLocal123!' }), output.response, database);
  const result = output.read();
  assert.equal(result.statusCode, 201);
  assert.equal((created.vendor as { status: string }).status, 'PENDING');
  assert.equal((created.vendor as { isActive: boolean }).isActive, false);
  assert.equal((created.user as { passwordHash: string }).passwordHash.includes('SecureLocal123!'), false);
  assert.deepEqual(created.vendorUser, { userId: 'owner-a', vendorId: 'vendor-new', capabilities: ['ADMIN'] });
});

test('super admin can link an existing admin to a new business without creating a duplicate user', async () => {
  const admin = { id: 'cmg1234567890abc', roles: ['SUPER_ADMIN'] as RoleName[] };
  const linkedOwner = {
    id: 'cmg1234567890abd',
    name: 'Local Super Admin',
    email: 'admin.local@farmmitra.test',
    mobile: null,
    status: 'ACTIVE',
    roles: [{ role: { name: 'SUPER_ADMIN' } }],
  };
  const created: Record<string, unknown> = {};
  const transaction = {
    vendor: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.vendor = data;
        return { id: 'vendor-rawat', ...data };
      },
    },
    vendorUser: {
      create: async ({ data }: { data: Record<string, unknown> }) => { created.vendorUser = data; return data; },
    },
  };
  const database = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => where.id === admin.id ? userRecord(admin) : linkedOwner,
    },
    vendor: { findFirst: async () => null },
    auditLog: { create: async () => undefined },
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as never;
  const output = responseFor();
  await callApi(requestFor('POST', '/api/v1/marketplace/admin/vendors', tokenFor(admin), {
    businessName: 'Rawat Farm',
    ownerUserId: linkedOwner.id,
  }), output.response, database);

  assert.equal(output.read().statusCode, 201);
  assert.deepEqual(created.vendor, {
    name: 'Rawat Farm',
    contactEmail: linkedOwner.email,
    contactPhone: null,
    address: undefined,
    isActive: false,
    status: 'PENDING',
  });
  assert.deepEqual(created.vendorUser, { userId: linkedOwner.id, vendorId: 'vendor-rawat', capabilities: ['ADMIN'] });
});

test('duplicate vendor owner account is rejected', async () => {
  const admin = { id: 'admin-a', roles: ['SUPER_ADMIN'] as RoleName[] };
  const database = {
    user: { findUnique: async () => userRecord(admin), findFirst: async () => ({ id: 'existing-user' }) },
  } as never;
  const output = responseFor();
  await callApi(requestFor('POST', '/api/v1/marketplace/admin/vendors', tokenFor(admin), { businessName: 'Duplicate Foods', ownerName: 'Existing Owner', email: 'owner@existing.test', phone: '9999999998', address: 'Road', password: 'SecureLocal123!' }), output.response, database);
  assert.equal(output.read().statusCode, 409);
});

test('admin vendor status transitions approve and suspend with audit records', async () => {
  const admin = { id: 'admin-a', roles: ['SUPER_ADMIN'] as RoleName[] };
  let current = { id: 'vendor-new', status: 'PENDING', isActive: false };
  const database = {
    user: { findUnique: async () => userRecord(admin) },
    vendor: { findUnique: async () => current, update: async ({ data }: { data: { status: string; isActive: boolean } }) => { current = { ...current, ...data }; return current; } },
    auditLog: { create: async () => undefined },
  } as never;
  const approve = responseFor();
  await callApi(requestFor('PATCH', '/api/v1/marketplace/admin/vendors/vendor-new/status', tokenFor(admin), { status: 'APPROVED' }), approve.response, database);
  assert.equal(approve.read().statusCode, 200);
  assert.deepEqual(current, { id: 'vendor-new', status: 'APPROVED', isActive: true });
  const suspend = responseFor();
  await callApi(requestFor('PATCH', '/api/v1/marketplace/admin/vendors/vendor-new/status', tokenFor(admin), { status: 'SUSPENDED' }), suspend.response, database);
  assert.equal(suspend.read().statusCode, 200);
  assert.deepEqual(current, { id: 'vendor-new', status: 'SUSPENDED', isActive: false });
});

test('suspended vendor and non-admin users cannot manage vendors', async () => {
  const suspended = { id: 'vendor-a-user', roles: ['VENDOR'] as RoleName[] };
  const suspendedDatabase = databaseFor(suspended, 'vendor-a', { vendorUser: { findFirst: async () => ({ vendorId: 'vendor-a', vendor: { id: 'vendor-a', status: 'SUSPENDED', isActive: false } }) } });
  const suspendedOutput = responseFor();
  await callApi(requestFor('GET', '/api/v1/marketplace/vendors/vendor-a/products', tokenFor(suspended), undefined), suspendedOutput.response, suspendedDatabase);
  assert.equal(suspendedOutput.read().statusCode, 403);

  for (const role of ['CUSTOMER', 'DELIVERY_PARTNER'] as RoleName[]) {
    const output = responseFor();
    const database = { user: { findUnique: async () => userRecord({ id: `${role}-user`, roles: [role] }) } } as never;
    await callApi(requestFor('POST', '/api/v1/marketplace/admin/vendors', tokenFor({ id: `${role}-user`, roles: [role] }), {}), output.response, database);
    assert.equal(output.read().statusCode, 403);
  }
});
