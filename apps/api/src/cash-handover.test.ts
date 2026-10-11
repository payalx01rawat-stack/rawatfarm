import assert from 'node:assert/strict';
import test from 'node:test';
import type { ServerResponse } from 'node:http';
import { signAccessToken } from './auth.js';
import { sendError } from './http.js';
import { handleApi } from './routes.js';

const callHandover = async (database: unknown, amount: number, key = 'handover-key-a') => {
  let statusCode = 0;
  let payload: unknown;
  const response = {
    writeHead: (status: number) => { statusCode = status; },
    end: (body?: string) => { payload = body ? JSON.parse(body) : null; },
  } as never as ServerResponse;
  const request = {
    method: 'POST',
    url: '/api/v1/marketplace/admin/cash-handovers',
    headers: {
      authorization: `Bearer ${signAccessToken({ userId: 'admin-a', roles: ['SUPER_ADMIN'], permissions: ['vendors.manage'] })}`,
      'idempotency-key': key,
    },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({     deliveryPartnerId: 'cmg1234567890abc', amount })); },
  };
  try {
    await handleApi(request as never, response, database as never);
  } catch (error) {
    sendError(response, error);
  }
  return { statusCode, payload: payload as Record<string, unknown> | null };
};

const fixture = (cashCollected: number, handedOver: number) => {
  let created: Record<string, unknown> | undefined;
  let createCount = 0;
  let paymentWasCreated = false;
  let cashAggregateFilter: unknown;
  const adminUser = {
    id: 'admin-a', status: 'ACTIVE',
    roles: [{ role: { name: 'SUPER_ADMIN', permissions: [{ permission: { name: 'vendors.manage' } }] } }],
  };
  const partner = {
    id: 'cmg1234567890abc', status: 'ACTIVE',
    roles: [{ role: { name: 'DELIVERY_PARTNER' } }],
  };
  const transaction = {
    $queryRaw: async () => [],
    vendorUser: { findUnique: async () => ({ isActive: true, capabilities: ['DELIVERY'], user: partner }) },
    payment: {
      aggregate: async ({ where }: { where: unknown }) => {
        cashAggregateFilter = where;
        return { _sum: { amount: cashCollected } };
      },
      create: async () => { paymentWasCreated = true; throw new Error('Handover must never create a customer payment'); },
    },
    cashHandover: {
      aggregate: async () => ({ _sum: { amount: handedOver } }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createCount += 1;
        created = { id: 'handover-a', ...data, deliveryPartner: { id: 'cmg1234567890abc', name: 'Delivery A' }, receivedBy: { id: 'admin-a', name: 'Admin A' } };
        return created;
      },
    },
  };
  const database = {
    user: { findUnique: async () => adminUser },
    vendor: { findMany: async () => [{ id: 'rawat-vendor' }] },
    vendorUser: { findMany: async () => [] },
    cashHandover: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) => created?.idempotencyKey === where.idempotencyKey ? created : null,
      findMany: async () => [],
    },
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
    payment: { aggregate: async () => ({ _sum: { amount: cashCollected } }) },
    auditLog: { create: async () => undefined },
  };
  return { database, read: () => ({ created, createCount, paymentWasCreated, cashAggregateFilter }) };
};

test('admin cash handover transfers collected cash without creating a customer payment', async () => {
  const fixtureData = fixture(500, 0);
  const result = await callHandover(fixtureData.database, 200);
  assert.equal(result.statusCode, 201);
  assert.equal((result.payload?.amount as { toString(): string }).toString(), '200');
  assert.equal(fixtureData.read().paymentWasCreated, false);
  assert.deepEqual(fixtureData.read().cashAggregateFilter, {
    vendorId: 'rawat-vendor', deliveryPartnerId: 'cmg1234567890abc', method: 'CASH', status: 'CASH_COLLECTED',
  });
  assert.equal(fixtureData.read().created?.receivedByUserId, 'admin-a');
  const replay = await callHandover(fixtureData.database, 200);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.payload?.idempotent, true);
  assert.equal(fixtureData.read().createCount, 1);
});

test('cash handover cannot exceed unhanded cash collections', async () => {
  const fixtureData = fixture(500, 450);
  const result = await callHandover(fixtureData.database, 100);
  assert.equal(result.statusCode, 400);
  assert.equal(fixtureData.read().created, undefined);
  assert.equal(fixtureData.read().paymentWasCreated, false);
});
