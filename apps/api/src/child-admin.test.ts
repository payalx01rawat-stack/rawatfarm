import assert from 'node:assert/strict';
import test from 'node:test';
import type { ServerResponse } from 'node:http';
import { ROLE_NAMES, signAccessToken } from './auth.js';
import { sendError } from './http.js';
import { handleApi } from './routes.js';

type UserFixture = { id: string; roles: string[]; status?: string; permissions?: string[]; childAdminPermissions?: string[] };

const childAdmin: UserFixture = {
  id: 'child-admin-id',
  roles: ['CHILD_ADMIN'],
  childAdminPermissions: [
    'users.read',
    'shops.read',
    'catalog.categories.read',
    'catalog.units.read',
    'catalog.products.read',
    'catalog.products.create',
    'catalog.products.update',
    'catalog.prices.read',
    'catalog.prices.create',
    'catalog.prices.update',
    'orders.read',
  ],
  permissions: [
    'users.read',
    'shops.read',
    'warehouse.read',
    'inventory.read',
    'catalog.categories.read',
    'catalog.units.read',
    'catalog.products.read',
    'catalog.products.create',
    'catalog.products.update',
    'catalog.variants.read',
    'catalog.prices.read',
    'catalog.prices.create',
    'catalog.prices.update',
    'orders.read',
  ],
};
const superAdmin: UserFixture = { id: 'super-admin-id', roles: ['SUPER_ADMIN'] };
const customer: UserFixture = { id: 'customer-account-id', roles: ['CUSTOMER'] };
const vendorUser: UserFixture = { id: 'vendor-account-id', roles: ['VENDOR'] };

const userRecord = (user: UserFixture) => ({
  id: user.id,
  name: user.id,
  email: null,
  mobile: null,
  preferredLanguage: 'en',
  status: user.status ?? 'ACTIVE',
  passwordHash: 'hash',
  childAdminPermissions: (user.childAdminPermissions ?? []).map((name) => ({ permission: { name } })),
  roles: user.roles.map((name) => ({ role: { id: `role-${name}`, name, permissions: (user.permissions ?? []).map((permission) => ({ permission: { name: permission } })) } })),
});

const requestFor = (method: string, url: string, user: UserFixture, payload?: unknown) => {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  return {
    method,
    url,
    headers: { authorization: `Bearer ${signAccessToken({ userId: user.id, roles: user.roles, permissions: user.permissions ?? [] })}` },
    async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(body); },
  } as never;
};

const responseFor = () => {
  let statusCode = 0;
  let payload = '';
  const response = {
    writeHead: (status: number) => { statusCode = status; },
    end: (body?: string) => { payload = body ?? ''; },
  } as unknown as ServerResponse;
  return { response, read: () => ({ statusCode, payload: payload ? JSON.parse(payload) as unknown : null }) };
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
  ...overrides,
});

test('CHILD_ADMIN is registered without replacing existing roles', () => {
  assert.equal(ROLE_NAMES.includes('CHILD_ADMIN'), true);
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'VENDOR', 'DELIVERY_PARTNER', 'CUSTOMER'] as const) {
    assert.equal(ROLE_NAMES.includes(role), true);
  }
});

test('Child Admin can read assigned customer, shop, and order resources only', async () => {
  let usersQuery: Record<string, unknown> | undefined;
  const database = authDatabase([childAdmin], {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => where.id === childAdmin.id ? userRecord(childAdmin) : null,
      findMany: async (query: Record<string, unknown>) => { usersQuery = query; return [userRecord(customer)]; },
    },
    shop: { findMany: async () => [{ id: 'shop-id', name: 'Local Shop' }] },
    vendor: { findMany: async () => [{ id: 'vendor-id', name: 'Farm Vendor', status: 'APPROVED', isActive: true, upiId: 'private@upi', products: [], users: [], _count: { products: 1, orders: 2, users: 1 } }] },
    vendorUser: { findMany: async () => [{ user: { ...userRecord({ id: 'partner-id', roles: ['DELIVERY_PARTNER'] }), passwordHash: 'private-password-hash' }, vendor: { id: 'vendor-id', name: 'Farm Vendor', upiId: 'private@upi', status: 'APPROVED', isActive: true }, isActive: true }] },
    payment: { findMany: async () => [{ id: 'payment-id', amount: 25, method: 'CASH', status: 'CASH_COLLECTED', vendor: { id: 'vendor-id', name: 'Farm Vendor', upiId: 'private@upi' }, receivedBy: { id: 'collector-id', name: 'Collector', passwordHash: 'private-password-hash' }, deliveryPartner: null }] },
    order: {
      findMany: async () => [{ id: 'order-id', orderNumber: 'FM-1', status: 'DELIVERED', totalAmount: 25, deliveries: [{ id: 'delivery-id', assignments: [{ userId: 'partner-id', user: { id: 'partner-id', name: 'Partner', status: 'ACTIVE', passwordHash: 'private-password-hash' } }] }] }],
      count: async () => 1,
    },
  });

  const customerList = responseFor();
  await invoke(requestFor('GET', '/api/v1/users', childAdmin), customerList.response, database);
  assert.equal(customerList.read().statusCode, 200);
  assert.deepEqual((customerList.read().payload as Array<{ roles: string[] }>).map((user) => user.roles), [['CUSTOMER']]);
  assert.deepEqual(usersQuery?.where, { roles: { some: { role: { name: 'CUSTOMER' } } } });

  const shops = responseFor();
  await invoke(requestFor('GET', '/api/v1/shops', childAdmin), shops.response, database);
  assert.equal(shops.read().statusCode, 200);

  const payments = responseFor();
  await invoke(requestFor('GET', '/api/v1/marketplace/admin/payments?business=rawat-farm', childAdmin), payments.response, database);
  assert.equal(payments.read().statusCode, 403);

  const vendors = responseFor();
  await invoke(requestFor('GET', '/api/v1/marketplace/admin/vendors', childAdmin), vendors.response, database);
  assert.equal(vendors.read().statusCode, 200);
  assert.equal(JSON.stringify(vendors.read().payload).includes('private@upi'), false);

  const partners = responseFor();
  await invoke(requestFor('GET', '/api/v1/marketplace/admin/delivery-partners', childAdmin), partners.response, database);
  assert.equal(partners.read().statusCode, 403);

  const orders = responseFor();
  await invoke(requestFor('GET', '/api/v1/orders?page=1&pageSize=100', childAdmin), orders.response, database);
  assert.equal(orders.read().statusCode, 200);
  assert.equal(JSON.stringify(orders.read().payload).includes('passwordHash'), false);
});

test('Child Admin cannot mutate or access non-allowlisted resources, even with forged permissions', async () => {
  let mutations = 0;
  const overprivilegedChild = { ...childAdmin, permissions: ['users.update', 'users.roles.assign', 'orders.create', 'vendors.manage'], childAdminPermissions: [] };
  const database = authDatabase([overprivilegedChild], {
    user: {
      findUnique: async () => userRecord(overprivilegedChild),
      update: async () => { mutations += 1; },
      create: async () => { mutations += 1; },
    },
    order: { create: async () => { mutations += 1; } },
    customerProductPrice: { upsert: async () => { mutations += 1; } },
  });

  const attempts: Array<[string, string, unknown?]> = [
    ['POST', '/api/v1/orders', { shopId: 'shop-id' }],
    ['PATCH', '/api/v1/users/me/preferred-language', { preferredLanguage: 'hi' }],
    ['PATCH', '/api/v1/users/target-id', { status: 'INACTIVE' }],
    ['POST', '/api/v1/users/target-id/roles', { roleName: 'SUPER_ADMIN' }],
    ['DELETE', '/api/v1/users/target-id/roles', { roleName: 'CHILD_ADMIN' }],
    ['POST', '/api/v1/marketplace/admin/cash-handovers', { deliveryPartnerId: 'partner-id', amount: 10 }],
    ['POST', '/api/v1/marketplace/admin/pricing/overrides', { customerId: 'customer-id' }],
    ['GET', '/api/v1/users/another-user'],
    ['GET', '/api/v1/marketplace/vendors/other-vendor/payment-settings'],
    ['GET', '/api/v1/settings'],
  ];
  for (const [method, url, payload] of attempts) {
    const output = responseFor();
    await invoke(requestFor(method, url, overprivilegedChild, payload), output.response, database);
    assert.equal(output.read().statusCode, 403, `${method} ${url} must be denied`);
  }
  assert.equal(mutations, 0);
});

test('Child Admin product grants do not grant pricing or inventory access', async () => {
  const productOnly = {
    ...childAdmin,
    childAdminPermissions: ['catalog.categories.read', 'catalog.units.read', 'catalog.products.read', 'catalog.products.create', 'catalog.products.update'],
  };
  let productQuery: Record<string, unknown> | undefined;
  const database = authDatabase([productOnly], {
    product: {
      findMany: async (query: Record<string, unknown>) => {
        productQuery = query;
        return [{
          id: 'product-id',
          categoryId: 'category-id',
          unitId: 'unit-id',
          name: 'Farm eggs',
          sku: 'RF-EGGS',
          description: null,
          status: 'ACTIVE',
          minOrderQuantity: 1,
          vendorId: 'rawat-vendor-id',
          imageUrl: null,
          stockQuantity: 87,
          lowStockThreshold: 5,
          trackInventory: true,
          vendor: { id: 'rawat-vendor-id', name: 'Rawat Farm', upiId: 'private@upi' },
          category: { id: 'category-id', name: 'Eggs' },
          unit: { id: 'unit-id', name: 'Piece', code: 'pc' },
          prices: [{ price: 25 }],
          variants: [],
        }];
      },
    },
  });

  const list = responseFor();
  await invoke(requestFor('GET', '/api/v1/catalog/products?business=other&vendorId=other-vendor', productOnly), list.response, database);
  assert.equal(list.read().statusCode, 200);
  assert.deepEqual((productQuery?.where as { vendor: unknown }).vendor, { is: { name: 'Rawat Farm' } });
  const serialized = JSON.stringify(list.read().payload);
  assert.equal(serialized.includes('stockQuantity'), false);
  assert.equal(serialized.includes('trackInventory'), false);
  assert.equal(serialized.includes('lowStockThreshold'), false);
  assert.equal(serialized.includes('private@upi'), false);
  assert.equal(serialized.includes('"price"'), false);

  const price = responseFor();
  await invoke(requestFor('GET', '/api/v1/marketplace/admin/pricing?action=automatic&vendorId=rawat-vendor-id', productOnly), price.response, database);
  assert.equal(price.read().statusCode, 403);

  const priceWrite = responseFor();
  await invoke(requestFor('PATCH', '/api/v1/catalog/products/product-id', productOnly, { price: 42 }), priceWrite.response, database);
  assert.equal(priceWrite.read().statusCode, 403);

  const inventoryWrite = responseFor();
  await invoke(requestFor('PATCH', '/api/v1/catalog/products/product-id', productOnly, { trackInventory: false }), inventoryWrite.response, database);
  assert.equal(inventoryWrite.read().statusCode, 403);
});

test('Child Admin can add a product without an unassigned price or inventory access', async () => {
  const productOnly = {
    ...childAdmin,
    childAdminPermissions: ['catalog.categories.read', 'catalog.units.read', 'catalog.products.read', 'catalog.products.create', 'catalog.products.update'],
  };
  let priceWrites = 0;
  const database = authDatabase([productOnly], {
    vendor: { findMany: async () => [{ id: 'rawat-vendor-id' }] },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      product: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'new-product-id',
          ...data,
          vendorId: 'rawat-vendor-id',
          stockQuantity: 0,
          trackInventory: true,
        }),
      },
      productPrice: { create: async () => { priceWrites += 1; } },
      stockMovement: { create: async () => { throw new Error('Child Admin must not create inventory movements'); } },
    }),
    auditLog: { create: async () => undefined },
  });
  const result = responseFor();
  await invoke(requestFor('POST', '/api/v1/catalog/products', productOnly, {
    categoryId: 'c123456789012345678901234',
    unitId: 'c123456789012345678901235',
    name: 'New farm product',
    sku: 'RF-NEW-PRODUCT',
  }), result.response, database);

  assert.equal(result.read().statusCode, 201);
  assert.equal(priceWrites, 0);
  const serialized = JSON.stringify(result.read().payload);
  assert.equal(serialized.includes('stockQuantity'), false);
  assert.equal(serialized.includes('trackInventory'), false);
  assert.equal(serialized.includes('"price"'), false);
});

test('Child Admin product deletion archives products with order history', async () => {
  let archived = false;
  let queriedOrderHistory = false;
  const database = authDatabase([childAdmin], {
    product: {
      findFirst: async () => ({ id: 'product-id', name: 'Farm eggs', status: 'ACTIVE' }),
      findUnique: async () => ({ id: 'product-id', name: 'Farm eggs', status: 'ACTIVE' }),
      update: async ({ data }: { data: { status: string } }) => {
        archived = data.status === 'INACTIVE';
        return { id: 'product-id', status: data.status };
      },
    },
    orderItem: {
      count: async ({ where }: { where: { productId: string } }) => {
        queriedOrderHistory = where.productId === 'product-id';
        return 3;
      },
    },
    auditLog: { create: async () => undefined },
  });
  const result = responseFor();
  await invoke(requestFor('DELETE', '/api/v1/catalog/products/product-id', childAdmin), result.response, database);

  assert.equal(result.read().statusCode, 200);
  assert.equal(archived, true);
  assert.equal(queriedOrderHistory, true);
  assert.deepEqual(result.read().payload, { id: 'product-id', status: 'INACTIVE', historicalOrderCount: 3 });
});

test('Child Admin cannot combine roles or use a customer IDOR path for a non-customer', async () => {
  const mixedRoles = { id: childAdmin.id, roles: ['CHILD_ADMIN', 'SUPER_ADMIN'] };
  const mixedResult = responseFor();
  await invoke(requestFor('GET', '/api/v1/marketplace/admin/vendors', mixedRoles), mixedResult.response, authDatabase([mixedRoles]));
  assert.equal(mixedResult.read().statusCode, 403);

  const database = authDatabase([childAdmin, vendorUser], {
    user: { findUnique: async ({ where }: { where: { id: string } }) => {
      const user = [childAdmin, vendorUser].find((candidate) => candidate.id === where.id);
      return user ? userRecord(user) : null;
    } },
    order: { findMany: async () => { throw new Error('Non-customer history must not query orders'); } },
  });
  const financialHistory = responseFor();
  await invoke(requestFor('GET', `/api/v1/users/${vendorUser.id}/financial-history`, childAdmin), financialHistory.response, database);
  assert.equal(financialHistory.read().statusCode, 403);
});

test('Only Super Admin can create a dedicated Child Admin account', async () => {
  let createdRoles: string[] | undefined;
  const database = authDatabase([superAdmin], {
    role: { findMany: async () => [{ id: 'child-role-id', name: 'CHILD_ADMIN' }] },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      role: { upsert: async () => ({ id: 'child-role-id', name: 'CHILD_ADMIN' }) },
      permission: { findMany: async () => Array.from({ length: 14 }, (_, index) => ({ id: `child-permission-${index}` })) },
      rolePermission: {
        deleteMany: async () => undefined,
        createMany: async () => ({ count: 14 }),
      },
    }),
    user: {
      findUnique: async () => userRecord(superAdmin),
      create: async ({ data }: { data: { name: string; email: string; mobile?: string; passwordHash: string; roles: { create: Array<{ roleId: string }> } } }) => {
        createdRoles = data.roles.create.map(() => 'CHILD_ADMIN');
        return { ...userRecord({ id: 'new-child', roles: ['CHILD_ADMIN'] }), name: data.name, email: data.email, mobile: data.mobile ?? null };
      },
      findMany: async () => [userRecord({ id: 'new-child', roles: ['CHILD_ADMIN'] })],
    },
    auditLog: { create: async () => undefined },
  });

  test('Super Admin can assign and revoke only allowlisted Child Admin permissions', async () => {
    const target = { ...childAdmin, childAdminPermissions: [] as string[] };
    const assigned: string[] = [];
    const database = authDatabase([superAdmin, target], {
      user: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const user = [superAdmin, target].find((candidate) => candidate.id === where.id);
          return user ? userRecord(user) : null;
        },
      },
      $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
        permission: { findMany: async ({ where }: { where: { name: { in: string[] } } }) => where.name.in.map((name) => ({ id: `permission-${name}`, name })) },
        childAdminPermission: {
          deleteMany: async () => { assigned.splice(0); },
          createMany: async ({ data }: { data: Array<{ permissionId: string }> }) => {
            assigned.push(...data.map(({ permissionId }) => permissionId.replace('permission-', '')));
            return { count: data.length };
          },
        },
      }),
      auditLog: { create: async () => undefined },
    });
    const assign = responseFor();
    await invoke(requestFor('PUT', `/api/v1/users/${target.id}/child-admin-permissions`, superAdmin, { permissionNames: ['catalog.products.read'] }), assign.response, database);
    assert.equal(assign.read().statusCode, 200);
    assert.deepEqual(assigned, ['catalog.products.read']);

    const revoke = responseFor();
    await invoke(requestFor('PUT', `/api/v1/users/${target.id}/child-admin-permissions`, superAdmin, { permissionNames: [] }), revoke.response, database);
    assert.equal(revoke.read().statusCode, 200);
    assert.deepEqual(assigned, []);

    const nonSuperAdmin = { id: 'admin-id', roles: ['ADMIN'], permissions: ['users.update'] };
    const denied = responseFor();
    await invoke(requestFor('PUT', `/api/v1/users/${target.id}/child-admin-permissions`, nonSuperAdmin, { permissionNames: ['catalog.products.read'] }), denied.response, authDatabase([nonSuperAdmin]));
    assert.equal(denied.read().statusCode, 403);
  });
  const created = responseFor();
  await invoke(requestFor('POST', '/api/v1/users', superAdmin, {
    name: 'Child Operator', email: 'child@example.test', password: 'secure-test-password', roleNames: ['CHILD_ADMIN'],
  }), created.response, database);
  assert.equal(created.read().statusCode, 201);
  assert.deepEqual(createdRoles, ['CHILD_ADMIN']);

  const viewed = responseFor();
  await invoke(requestFor('GET', '/api/v1/users', superAdmin), viewed.response, database);
  assert.equal(viewed.read().statusCode, 200);
  assert.deepEqual((viewed.read().payload as Array<{ roles: string[] }>)[0]?.roles, ['CHILD_ADMIN']);

  const nonSuperAdmin = { id: 'admin-id', roles: ['ADMIN'], permissions: ['users.create'] };
  let roleLookup = false;
  const denied = responseFor();
  await invoke(requestFor('POST', '/api/v1/users', nonSuperAdmin, {
    name: 'Escalated User', email: 'escalated@example.test', password: 'secure-test-password', roleNames: ['CHILD_ADMIN'],
  }), denied.response, authDatabase([nonSuperAdmin], {
    role: { findMany: async () => { roleLookup = true; return []; } },
  }));
  assert.equal(denied.read().statusCode, 403);
  assert.equal(roleLookup, false);

  let accountUpdates = 0;
  const targetChild = { id: 'target-child', roles: ['CHILD_ADMIN'] };
  const deniedAccountChange = responseFor();
  await invoke(requestFor('PATCH', `/api/v1/users/${targetChild.id}`, nonSuperAdmin, { status: 'INACTIVE' }), deniedAccountChange.response, authDatabase([nonSuperAdmin, targetChild], {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const user = [nonSuperAdmin, targetChild].find((candidate) => candidate.id === where.id);
        return user ? userRecord(user) : null;
      },
      update: async () => { accountUpdates += 1; },
    },
  }));
  assert.equal(deniedAccountChange.read().statusCode, 403);
  assert.equal(accountUpdates, 0);
});

test('Super Admin can deactivate and revoke a Child Admin account', async () => {
  const childAccount: UserFixture = { id: 'managed-child', roles: ['CHILD_ADMIN'] };
  let status = 'ACTIVE';
  let childRoleRemoved = false;
  const database = authDatabase([superAdmin, childAccount], {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === superAdmin.id) return userRecord(superAdmin);
        return { ...userRecord(childAccount), status };
      },
      update: async ({ data }: { data: { status: string } }) => { status = data.status; return { ...userRecord(childAccount), status }; },
    },
    role: { findUnique: async () => ({ id: 'child-role-id', name: 'CHILD_ADMIN' }) },
    userRole: { delete: async () => { childRoleRemoved = true; } },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      userRole: { delete: async () => { childRoleRemoved = true; } },
      user: { update: async ({ data }: { data: { status: string } }) => { status = data.status; } },
    }),
    auditLog: { create: async () => undefined },
  });

  const deactivated = responseFor();
  await invoke(requestFor('PATCH', `/api/v1/users/${childAccount.id}`, superAdmin, { status: 'INACTIVE' }), deactivated.response, database);
  assert.equal(deactivated.read().statusCode, 200);
  assert.equal(status, 'INACTIVE');

  status = 'ACTIVE';
  const revoked = responseFor();
  await invoke(requestFor('DELETE', `/api/v1/users/${childAccount.id}/roles`, superAdmin, { roleName: 'CHILD_ADMIN' }), revoked.response, database);
  assert.equal(revoked.read().statusCode, 204);
  assert.equal(childRoleRemoved, true);
  assert.equal(status, 'INACTIVE');
});