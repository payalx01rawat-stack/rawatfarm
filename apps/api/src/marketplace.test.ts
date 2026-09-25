import assert from 'node:assert/strict';
import test from 'node:test';
import type { ServerResponse } from 'node:http';
import { signAccessToken } from './auth.js';
import { sendError } from './http.js';
import { handleApi } from './routes.js';
import { productSchema } from './schemas.js';

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

const requestFor = (method: string, url: string, token: string, payload?: unknown) => {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  return {
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
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
