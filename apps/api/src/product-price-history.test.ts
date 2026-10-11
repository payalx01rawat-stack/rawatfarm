import assert from 'node:assert/strict';
import test from 'node:test';
import type { ServerResponse } from 'node:http';
import { signAccessToken } from './auth.js';
import { sendError } from './http.js';
import { handleApi } from './routes.js';

const requestFor = (method: string, url: string, userId: string, roleName: string, payload?: unknown) => {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  return {
    method,
    url,
    headers: { authorization: `Bearer ${signAccessToken({ userId, roles: [roleName], permissions: ['catalog.products.update'] })}` },
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

const invoke = async (request: never, response: ServerResponse, database: unknown) => {
  try {
    await handleApi(request, response, database as never);
  } catch (error) {
    sendError(response, error);
  }
};

test('admin product creation assigns the Rawat Farm vendor and records its initial price atomically', async () => {
  let createdProduct: Record<string, unknown> | undefined;
  let createdPrice: Record<string, unknown> | undefined;
  const tx = {
    product: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdProduct = { id: 'product-a', ...data };
        return createdProduct;
      },
    },
    productPrice: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdPrice = data;
        return data;
      },
    },
  };
  const database = {
    user: {
      findUnique: async () => ({
        id: 'admin-a',
        status: 'ACTIVE',
        roles: [{ role: { name: 'SUPER_ADMIN', permissions: [] } }],
      }),
    },
    vendor: { findMany: async () => [{ id: 'rawat-farm-vendor' }] },
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    auditLog: { create: async () => undefined },
  };
  const output = responseFor();
  await invoke(requestFor('POST', '/api/v1/catalog/products', 'admin-a', 'SUPER_ADMIN', {
    name: 'Chicken',
    sku: 'RF-CHICKEN-001',
    categoryId: 'cmg1234567890abc',
    unitId: 'cmg1234567890abd',
    price: 55,
    minOrderQuantity: 1,
    status: 'ACTIVE',
    imageUrl: 'https://example.test/chicken.png',
    trackInventory: false,
  }), output.response, database);

  assert.equal(output.read().statusCode, 201);
  assert.equal(createdProduct?.vendorId, 'rawat-farm-vendor');
  assert.equal(createdProduct?.minOrderQuantity, 1);
  assert.equal(createdProduct?.imageUrl, 'https://example.test/chicken.png');
  assert.equal(createdProduct?.trackInventory, false);
  assert.equal(createdPrice?.productId, 'product-a');
  assert.equal(createdPrice?.price, 55);
  assert.ok(createdPrice?.validFrom instanceof Date);
});

test('product price updates preserve the historical order item price', async () => {
  let closedPrice: Record<string, unknown> | undefined;
  let newPrice: Record<string, unknown> | undefined;
  let orderUpdated = false;
  const tx = {
    product: {
      findUnique: async () => ({ id: 'product-a' }),
      update: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'product-a', ...data }),
    },
    productPrice: {
      findFirst: async () => ({ id: 'price-old', price: '40.00' }),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        closedPrice = { ...where, ...data };
        return closedPrice;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        newPrice = data;
        return data;
      },
    },
  };
  const database = {
    user: {
      findUnique: async () => ({
        id: 'admin-a',
        status: 'ACTIVE',
        roles: [{ role: { name: 'SUPER_ADMIN', permissions: [] } }],
      }),
    },
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    auditLog: { create: async () => undefined },
    order: { update: async () => { orderUpdated = true; } },
  };
  const output = responseFor();
  await invoke(requestFor('PATCH', '/api/v1/catalog/products/product-a', 'admin-a', 'SUPER_ADMIN', { price: 55 }), output.response, database);

  assert.equal(output.read().statusCode, 200);
  assert.equal(closedPrice?.id, 'price-old');
  assert.ok(closedPrice?.validTo instanceof Date);
  assert.equal(newPrice?.productId, 'product-a');
  assert.equal(newPrice?.price, 55);
  assert.ok(newPrice?.validFrom instanceof Date);
  assert.equal(orderUpdated, false);
});

test('product mutation requires an admin role even when a user has catalog permission', async () => {
  let updated = false;
  const database = {
    user: {
      findUnique: async () => ({
        id: 'vendor-user',
        status: 'ACTIVE',
        roles: [{ role: { name: 'VENDOR', permissions: [{ permission: { name: 'catalog.products.update' } }] } }],
      }),
    },
    product: { update: async () => { updated = true; } },
  };
  const output = responseFor();
  await invoke(requestFor('PATCH', '/api/v1/catalog/products/product-a', 'vendor-user', 'VENDOR', { price: 55 }), output.response, database);

  assert.equal(output.read().statusCode, 403);
  assert.equal(updated, false);
});
