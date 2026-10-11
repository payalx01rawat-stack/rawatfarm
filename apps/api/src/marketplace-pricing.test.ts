import assert from 'node:assert/strict';
import test from 'node:test';
import type { ServerResponse } from 'node:http';
import { hashPassword, signAccessToken } from './auth.js';
import { sendError } from './http.js';
import { handleApi } from './routes.js';

type UserFixture = { id: string; role: string; status?: string; permissions?: string[]; childAdminPermissions?: string[] };

const customerA: UserFixture = { id: 'c123456789012345678901237', role: 'CUSTOMER' };
const customerB: UserFixture = { id: 'c123456789012345678901238', role: 'CUSTOMER' };
const customerC: UserFixture = { id: 'c123456789012345678901239', role: 'CUSTOMER' };
const admin: UserFixture = { id: 'admin-a', role: 'SUPER_ADMIN' };
const childPricingAdmin: UserFixture = {
  id: 'child-pricing-admin',
  role: 'CHILD_ADMIN',
  permissions: ['catalog.prices.read', 'catalog.prices.create', 'catalog.prices.update'],
  childAdminPermissions: ['catalog.prices.read', 'catalog.prices.create', 'catalog.prices.update'],
};
const productId = 'c123456789012345678901234';
const vendorId = 'c123456789012345678901235';
const addressId = 'c123456789012345678901236';
const productA = { id: productId, vendorId, name: 'Chicken', status: 'ACTIVE', unitId: 'unit-kg', minOrderQuantity: 1, unit: { code: 'kg', precision: 3 }, vendor: { id: vendorId, isActive: true, status: 'APPROVED' }, stockQuantity: 20, lowStockThreshold: 2, trackInventory: false };
const address = { id: addressId, userId: customerA.id, line1: '1 Market Road', city: 'Delhi', state: 'Delhi', postalCode: '110001' };

const userRecord = (user: UserFixture) => ({
  id: user.id,
  status: user.status ?? 'ACTIVE',
  childAdminPermissions: (user.childAdminPermissions ?? []).map((name) => ({ permission: { name } })),
  roles: [{ role: { name: user.role, permissions: (user.permissions ?? []).map((name) => ({ permission: { name } })) } }],
});

const requestFor = (method: string, url: string, user: UserFixture | null, payload?: unknown) => {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  return {
    method,
    url,
    headers: user ? { authorization: `Bearer ${signAccessToken({ userId: user.id, roles: [user.role], permissions: user.permissions ?? [] })}` } : {},
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
    read: () => ({ statusCode, payload: payload ? JSON.parse(payload) as Record<string, unknown> | Array<Record<string, unknown>> : null }),
  };
};

const invoke = async (request: never, response: ServerResponse, database: unknown) => {
  try {
    await handleApi(request, response, database as never);
  } catch (error) {
    sendError(response, error);
  }
};

const authDatabase = (users: UserFixture[], overrides: Record<string, unknown> = {}) => ({
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const user = users.find((candidate) => candidate.id === where.id);
      return user ? userRecord(user) : null;
    },
  },
  vendorCustomerPricingRule: { findUnique: async () => null },
  ...overrides,
});

test('marketplace returns customer/vendor scoped effective prices without exposing other overrides', async () => {
  const customerRates = new Map([
    [`${customerA.id}:${vendorId}:${productId}`, 260],
    [`${customerB.id}:${vendorId}:${productId}`, 275],
  ]);
  const database = authDatabase([customerA, customerB], {
    product: { findMany: async () => [productA] },
    customerProductPrice: {
      findFirst: async ({ where }: { where: { customerId: string; vendorId: string; productId: string } }) => {
        const price = customerRates.get(`${where.customerId}:${where.vendorId}:${where.productId}`);
        return price === undefined ? null : { price };
      },
    },
    productPrice: { findFirst: async () => ({ price: 280 }) },
  });

  const getCatalog = async (customer: UserFixture | null) => {
    const output = responseFor();
    await invoke(requestFor('GET', '/api/v1/marketplace/products', customer), output.response, database);
    assert.equal(output.read().statusCode, 200);
    return (output.read().payload as Array<Record<string, unknown>>)[0]!;
  };
  const resultA = await getCatalog(customerA);
  const resultB = await getCatalog(customerB);
  const anonymousResult = await getCatalog(null);

  assert.equal(resultA.price, 260);
  assert.equal(resultA.priceSource, 'CUSTOMER_OVERRIDE');
  assert.equal(resultB.price, 275);
  assert.equal(anonymousResult.price, 280);
  assert.equal(anonymousResult.priceSource, 'BASE');
  assert.equal('customerPrice' in resultA, false);
  assert.equal('overrideId' in resultA, false);
});

test('customer price override is limited to the exact product vendor and customer', async () => {
  let lookup: Record<string, unknown> | undefined;
  const database = authDatabase([customerA], {
    product: { findMany: async () => [productA] },
    customerProductPrice: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        lookup = where;
        return null;
      },
    },
    productPrice: { findFirst: async () => ({ price: 280 }) },
  });
  const output = responseFor();
  await invoke(requestFor('GET', '/api/v1/marketplace/products', customerA), output.response, database);

  assert.deepEqual(lookup, { customerId: customerA.id, vendorId: productA.vendorId, productId: productA.id, isActive: true });
  assert.equal((output.read().payload as Array<Record<string, unknown>>)[0]?.price, 280);
});

test('automatic shop pricing applies only to new customers and never overrides a manual customer rate', async () => {
  const createdAt = new Map([
    [customerA.id, new Date('2026-10-02T00:00:00.000Z')],
    [customerB.id, new Date('2026-09-01T00:00:00.000Z')],
    [customerC.id, new Date('2026-10-02T00:00:00.000Z')],
  ]);
  const rateByCustomer = new Map([[customerA.id, 255]]);
  const ruleEffectiveFrom = new Date('2026-10-01T00:00:00.000Z');
  const database = authDatabase([customerA, customerB, customerC], {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        ...userRecord([customerA, customerB, customerC].find((user) => user.id === where.id)!),
        createdAt: createdAt.get(where.id),
      }),
    },
    product: { findMany: async () => [productA] },
    customerProductPrice: {
      findFirst: async ({ where }: { where: { customerId: string; vendorId: string; productId: string } }) => {
        const price = where.vendorId === vendorId && where.productId === productId ? rateByCustomer.get(where.customerId) : undefined;
        return price === undefined ? null : { price };
      },
    },
    productPrice: { findFirst: async () => ({ price: 280 }) },
    vendorCustomerPricingRule: {
      findUnique: async ({ where }: { where: { vendorId: string } }) => where.vendorId === vendorId
        ? { vendorId, percentAdjustment: 10, isActive: true, effectiveFrom: ruleEffectiveFrom }
        : null,
    },
  });

  const getCatalog = async (customer: UserFixture) => {
    const output = responseFor();
    await invoke(requestFor('GET', '/api/v1/marketplace/products', customer), output.response, database);
    assert.equal(output.read().statusCode, 200);
    return (output.read().payload as Array<Record<string, unknown>>)[0]!;
  };

  const overriddenCustomer = await getCatalog(customerA);
  const existingCustomer = await getCatalog(customerB);
  const newCustomer = await getCatalog(customerC);
  assert.equal(overriddenCustomer.price, 255);
  assert.equal(overriddenCustomer.priceSource, 'CUSTOMER_OVERRIDE');
  assert.equal(existingCustomer.price, 280);
  assert.equal(existingCustomer.priceSource, 'BASE');
  assert.equal(newCustomer.price, 308);
  assert.equal(newCustomer.priceSource, 'AUTOMATIC_RULE');
});

test('checkout snapshots server customer pricing and ignores no submitted price fields', async () => {
  let orderData: Record<string, unknown> | undefined;
  let masterData: Record<string, unknown> | undefined;
  const tx = {
    masterOrder: {
      create: async ({ data }: { data: Record<string, unknown> }) => { masterData = data; return { id: 'master-a' }; },
      findUnique: async () => ({ id: 'master-a', totalAmount: masterData?.totalAmount, subOrders: [{ id: 'order-a', items: (orderData?.items as { create: unknown[] }).create }] }),
    },
    order: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        orderData = data;
        const itemData = (data.items as { create: Array<Record<string, unknown>> }).create;
        return { id: 'order-a', items: itemData.map((item, index) => ({ ...item, id: `order-item-${index}` })) };
      },
    },
    product: { findUnique: async () => ({ id: productA.id, trackInventory: false, stockQuantity: 20 }) },
  };
  const database = authDatabase([customerA], {
    shop: { findFirst: async () => ({ id: 'rawat-shop' }) },
    warehouse: { findFirst: async () => ({ branchId: 'branch-a' }) },
    customerAddress: { findFirst: async () => address },
    product: { findUnique: async () => productA },
    customerProductPrice: { findFirst: async () => ({ price: 25.25 }) },
    productPrice: { findFirst: async () => ({ price: 280 }) },
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  });
  const output = responseFor();
  await invoke(requestFor('POST', '/api/v1/marketplace/orders', customerA, {
    addressId: address.id,
    items: [{ productId: productA.id, quantity: 2 }],
  }), output.response, database);
  const result = output.read();
  assert.equal(result.statusCode, 201);
  assert.equal(orderData?.totalAmount, 50.5);
  assert.equal(masterData?.totalAmount, 50.5);
  const item = ((orderData?.items as { create: Array<Record<string, unknown>> }).create)[0]!;
  assert.equal(item.unitPrice, 25.25);
  assert.equal(item.lineTotal, 50.5);
  assert.equal(item.unitId, productA.unitId);
});

test('checkout rejects client-submitted prices, missing price, invalid customer, and below-minimum quantity', async () => {
  const user: UserFixture = { ...customerA };
  let priceExists = true;
  let productActive = true;
  const database = authDatabase([user, { id: 'vendor-user', role: 'VENDOR' }, { id: 'inactive-customer', role: 'CUSTOMER', status: 'INACTIVE' }], {
    shop: { findFirst: async () => ({ id: 'rawat-shop' }) },
    warehouse: { findFirst: async () => ({ branchId: 'branch-a' }) },
    customerAddress: { findFirst: async () => address },
    product: { findUnique: async () => ({ ...productA, minOrderQuantity: 2, status: productActive ? 'ACTIVE' : 'INACTIVE' }) },
    customerProductPrice: { findFirst: async () => null },
    productPrice: { findFirst: async () => priceExists ? ({ price: 280 }) : null },
  });

  const submit = async (payload: unknown, account = user) => {
    const output = responseFor();
    await invoke(requestFor('POST', '/api/v1/marketplace/orders', account, payload), output.response, database);
    return output.read();
  };
  assert.equal((await submit({ addressId: address.id, items: [{ productId: productA.id, quantity: 2, price: 1 }] })).statusCode, 400);
  assert.equal((await submit({ addressId: address.id, items: [{ productId: productA.id, quantity: 1 }] })).statusCode, 400);
  assert.equal((await submit({ addressId: address.id, items: [{ productId: productA.id, quantity: 2.1234 }] })).statusCode, 400);
  priceExists = false;
  assert.equal((await submit({ addressId: address.id, items: [{ productId: productA.id, quantity: 2 }] })).statusCode, 400);
  priceExists = true;
  productActive = false;
  assert.equal((await submit({ addressId: address.id, items: [{ productId: productA.id, quantity: 2 }] })).statusCode, 400);
  assert.equal((await submit({ addressId: address.id, items: [{ productId: productA.id, quantity: 2 }] }, { id: 'inactive-customer', role: 'CUSTOMER', status: 'INACTIVE' })).statusCode, 401);
  assert.equal((await submit({ addressId: address.id, items: [{ productId: productA.id, quantity: 2 }] }, { id: 'vendor-user', role: 'VENDOR' })).statusCode, 403);
});

test('public customer registration is blocked while an administrator can enroll a customer', async () => {
  let createdUser: Record<string, unknown> | undefined;
  let accountCreateCalled = false;
  const database = authDatabase([admin], {
    role: { findMany: async () => [{ id: 'customer-role', name: 'CUSTOMER' }] },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => where.id === admin.id ? userRecord(admin) : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        accountCreateCalled = true;
        createdUser = data;
        return { id: 'new-customer', name: data.name, email: data.email ?? null, mobile: data.mobile ?? null, preferredLanguage: 'en', status: 'ACTIVE', roles: [{ role: { name: 'CUSTOMER' } }] };
      },
    },
    auditLog: { create: async () => undefined },
  });
  const publicResult = responseFor();
  await invoke(requestFor('POST', '/api/v1/auth/register', null, { name: 'Public Customer', email: 'public@example.test', password: 'test-password' }), publicResult.response, database);
  assert.equal(publicResult.read().statusCode, 403);
  assert.equal(accountCreateCalled, false);

  const enrollmentResult = responseFor();
  await invoke(requestFor('POST', '/api/v1/users', admin, { name: 'Enrolled Customer', email: 'customer@example.test', password: 'test-password', roleNames: ['CUSTOMER'] }), enrollmentResult.response, database);
  assert.equal(enrollmentResult.read().statusCode, 201);
  assert.notEqual(createdUser?.passwordHash, 'test-password');
  assert.equal(JSON.stringify(enrollmentResult.read().payload).includes('passwordHash'), false);
});

test('inactive accounts receive a clear login denial after credential verification', async () => {
  const passwordHash = await hashPassword('valid-local-test-password');
  const database = {
    user: {
      findFirst: async () => ({
        id: 'inactive-customer',
        name: 'Inactive Customer',
        email: 'inactive@example.test',
        mobile: null,
        preferredLanguage: 'en',
        status: 'INACTIVE',
        passwordHash,
        roles: [{ role: { name: 'CUSTOMER', permissions: [] } }],
      }),
    },
  };
  const result = responseFor();
  await invoke(requestFor('POST', '/api/v1/auth/login', null, { identifier: 'inactive@example.test', password: 'valid-local-test-password' }), result.response, database);

  assert.equal(result.read().statusCode, 403);
  assert.match(String((result.read().payload as Record<string, unknown>).error), /inactive/i);
});

test('only administrators can view and change customer pricing', async () => {
  let productCalls = 0;
  let overrideWrites = 0;
  const database = authDatabase([admin, customerA, { id: 'vendor-user', role: 'VENDOR', permissions: ['vendors.manage'] }], {
    vendor: { findUnique: async () => ({ id: vendorId, name: 'Rawat Farm' }) },
    product: {
      findMany: async () => {
        productCalls += 1;
        return [{ ...productA, prices: [{ price: 280 }], customerPrices: [{ id: 'override-a', price: 260 }] }];
      },
    },
    customerProductPrice: {
      findFirst: async () => null,
      upsert: async () => { overrideWrites += 1; },
    },
  });
  const allowed = responseFor();
  await invoke(requestFor('GET', `/api/v1/marketplace/admin/pricing?vendorId=${vendorId}&customerId=${customerA.id}`, admin), allowed.response, database);
  assert.equal(allowed.read().statusCode, 200);
  assert.equal((allowed.read().payload as Array<Record<string, unknown>>)[0]?.effectivePrice, 260);

  const denied = responseFor();
  await invoke(requestFor('GET', `/api/v1/marketplace/admin/pricing?vendorId=${vendorId}&customerId=${customerA.id}`, { id: 'vendor-user', role: 'VENDOR', permissions: ['vendors.manage'] }), denied.response, database);
  assert.equal(denied.read().statusCode, 403);

  const deniedWrite = responseFor();
  await invoke(requestFor('POST', '/api/v1/marketplace/admin/pricing/overrides', { id: 'vendor-user', role: 'VENDOR', permissions: ['vendors.manage'] }, {
    customerId: customerA.id,
    vendorId,
    productId,
    price: 250,
  }), deniedWrite.response, database);
  assert.equal(deniedWrite.read().statusCode, 403);
  assert.equal(productCalls, 1);
  assert.equal(overrideWrites, 0);
});

test('Child Admin can manage scoped customer pricing only with dedicated pricing permissions', async () => {
  let upsertWhere: Record<string, unknown> | undefined;
  let overrideUpdateCount = 0;
  const database = authDatabase([childPricingAdmin, customerA], {
    vendor: { findUnique: async () => ({ id: vendorId, name: 'Shop A' }) },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => where.id === customerA.id
        ? { ...userRecord(customerA), createdAt: new Date('2026-10-01T00:00:00.000Z') }
        : userRecord(childPricingAdmin),
    },
    product: { findFirst: async ({ where }: { where: { id: string; vendorId: string } }) => where.vendorId === vendorId ? { id: productId } : null },
    customerProductPrice: {
      upsert: async (args: { where: Record<string, unknown> }) => { upsertWhere = args.where; return { id: 'override-id' }; },
      findUnique: async () => ({ id: 'override-id', customerId: customerA.id, vendorId: 'other-vendor', productId }),
      update: async () => { overrideUpdateCount += 1; return { id: 'override-id', isActive: false }; },
    },
    auditLog: { create: async () => undefined },
  });

  const saved = responseFor();
  await invoke(requestFor('POST', '/api/v1/marketplace/admin/pricing/overrides', childPricingAdmin, {
    customerId: customerA.id, vendorId, productId, price: 250,
  }), saved.response, database);
  assert.equal(saved.read().statusCode, 200);
  assert.deepEqual(upsertWhere, { customerId_vendorId_productId: { customerId: customerA.id, vendorId, productId } });

  const crossShopDelete = responseFor();
  await invoke(requestFor('DELETE', `/api/v1/marketplace/admin/pricing/overrides/override-id?vendorId=${vendorId}&customerId=${customerA.id}&productId=${productId}`, childPricingAdmin), crossShopDelete.response, database);
  assert.equal(crossShopDelete.read().statusCode, 404);
  assert.equal(overrideUpdateCount, 0);

  const underprivileged = responseFor();
  const readOnlyChild = { id: 'read-only-child', role: 'CHILD_ADMIN', permissions: ['catalog.prices.read'], childAdminPermissions: ['catalog.prices.read'] };
  const readOnlyDatabase = authDatabase([childPricingAdmin, customerA, readOnlyChild], {
    vendor: { findUnique: async () => ({ id: vendorId, name: 'Shop A' }) },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const user = [childPricingAdmin, customerA, readOnlyChild].find((candidate) => candidate.id === where.id);
        return user ? { ...userRecord(user), createdAt: new Date('2026-10-01T00:00:00.000Z') } : null;
      },
    },
    product: { findFirst: async () => ({ id: productId }) },
    customerProductPrice: { upsert: async () => { upsertWhere = { unexpected: true }; return { id: 'unexpected' }; } },
  });
  await invoke(requestFor('POST', '/api/v1/marketplace/admin/pricing/overrides', readOnlyChild, {
    customerId: customerA.id, vendorId, productId, price: 250,
  }), underprivileged.response, readOnlyDatabase);
  assert.equal(underprivileged.read().statusCode, 403);
});

test('Child Admin automatic pricing rules are saved only for the selected vendor', async () => {
  let savedRule: Record<string, unknown> | undefined;
  const database = authDatabase([childPricingAdmin], {
    vendor: { findUnique: async ({ where }: { where: { id: string } }) => where.id === vendorId ? { id: vendorId } : null },
    vendorCustomerPricingRule: {
      findUnique: async ({ where }: { where: { vendorId: string } }) => where.vendorId === vendorId ? null : null,
      upsert: async (args: { where: { vendorId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        savedRule = { ...args.create, ...args.update, vendorId: args.where.vendorId, id: 'rule-id' };
        return savedRule;
      },
    },
    auditLog: { create: async () => undefined },
  });

  const saved = responseFor();
  await invoke(requestFor('PATCH', '/api/v1/marketplace/admin/pricing?action=automatic', childPricingAdmin, {
    vendorId, percentAdjustment: 7.5, isActive: true,
  }), saved.response, database);
  assert.equal(saved.read().statusCode, 200);
  assert.equal(savedRule?.vendorId, vendorId);
  assert.equal(savedRule?.percentAdjustment, 7.5);
  assert.equal(savedRule?.isActive, true);
  assert.ok(savedRule?.effectiveFrom instanceof Date);

  const invalid = responseFor();
  await invoke(requestFor('PATCH', '/api/v1/marketplace/admin/pricing?action=automatic', childPricingAdmin, {
    vendorId, percentAdjustment: -101, isActive: true,
  }), invalid.response, database);
  assert.equal(invalid.read().statusCode, 400);
});

test('admin override updates are scoped, finite, and non-negative', async () => {
  let upsertData: Record<string, unknown> | undefined;
  const database = authDatabase([admin, customerA], {
    product: { findFirst: async () => ({ id: productA.id }) },
    customerProductPrice: {
      upsert: async (args: Record<string, unknown>) => {
        upsertData = args;
        return { id: 'override-a', customerId: customerA.id, vendorId: productA.vendorId, productId: productA.id, price: 0, isActive: true };
      },
    },
    auditLog: { create: async () => undefined },
  });
  const result = responseFor();
  await invoke(requestFor('POST', '/api/v1/marketplace/admin/pricing/overrides', admin, {
    customerId: customerA.id,
    vendorId: productA.vendorId,
    productId: productA.id,
    price: 0,
  }), result.response, database);
  assert.equal(result.read().statusCode, 200);
  assert.deepEqual(upsertData?.where, { customerId_vendorId_productId: { customerId: customerA.id, vendorId: productA.vendorId, productId: productA.id } });

  const invalid = responseFor();
  await invoke(requestFor('POST', '/api/v1/marketplace/admin/pricing/overrides', admin, {
    customerId: customerA.id,
    vendorId: productA.vendorId,
    productId: productA.id,
    price: 'Infinity',
  }), invalid.response, database);
  assert.equal(invalid.read().statusCode, 400);
});

test('removing a customer override falls back to the vendor base price', async () => {
  let active = true;
  const database = authDatabase([admin, customerA], {
    product: { findMany: async () => [productA] },
    customerProductPrice: {
      findUnique: async () => ({ id: 'override-a', customerId: customerA.id, vendorId, productId, isActive: active }),
      update: async () => { active = false; return { id: 'override-a', isActive: active }; },
      findFirst: async () => active ? ({ price: 260 }) : null,
    },
    productPrice: { findFirst: async () => ({ price: 280 }) },
    auditLog: { create: async () => undefined },
  });

  const removed = responseFor();
  await invoke(requestFor('DELETE', '/api/v1/marketplace/admin/pricing/overrides/override-a', admin), removed.response, database);
  assert.equal(removed.read().statusCode, 200);
  assert.equal(active, false);

  const catalog = responseFor();
  await invoke(requestFor('GET', '/api/v1/marketplace/products', customerA), catalog.response, database);
  assert.equal(catalog.read().statusCode, 200);
  assert.equal((catalog.read().payload as Array<Record<string, unknown>>)[0]?.price, 280);
  assert.equal((catalog.read().payload as Array<Record<string, unknown>>)[0]?.priceSource, 'BASE');
});

test('admin base-price changes close the previous rate without modifying historical orders', async () => {
  let closedPrice: Record<string, unknown> | undefined;
  let currentPrice: Record<string, unknown> | undefined;
  let ordersChanged = false;
  const tx = {
    productPrice: {
      findFirst: async () => ({ id: 'previous-rate', price: 280 }),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        closedPrice = { ...where, ...data };
        return closedPrice;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        currentPrice = data;
        return { id: 'new-rate', ...data };
      },
    },
  };
  const database = authDatabase([admin], {
    product: { findFirst: async () => ({ id: productId }) },
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    auditLog: { create: async () => undefined },
    order: { updateMany: async () => { ordersChanged = true; } },
  });
  const result = responseFor();
  await invoke(requestFor('PATCH', '/api/v1/marketplace/admin/pricing?action=base', admin, { vendorId, productId, price: 275 }), result.response, database);

  assert.equal(result.read().statusCode, 200);
  assert.equal(closedPrice?.id, 'previous-rate');
  assert.ok(closedPrice?.validTo instanceof Date);
  assert.equal(currentPrice?.productId, productId);
  assert.equal(currentPrice?.price, 275);
  assert.equal(currentPrice?.shopId, null);
  assert.equal(ordersChanged, false);
});
