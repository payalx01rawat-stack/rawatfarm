import assert from 'node:assert/strict';
import test from 'node:test';
import type { ServerResponse } from 'node:http';
import { signAccessToken } from './auth.js';
import { sendError } from './http.js';
import { handleApi } from './routes.js';

const requestFor = (userId: string, roles: string[]) => ({
  method: 'GET',
  url: '/api/v1/users/customer-a/financial-history',
  headers: { authorization: ['Bearer', signAccessToken({ userId, roles, permissions: [] })].join(' ') },
  async *[Symbol.asyncIterator]() {},
}) as never;

const responseFor = () => {
  let statusCode = 0;
  let payload = '';
  const response = {
    writeHead: (status: number) => { statusCode = status; },
    end: (body?: string) => { payload = body ?? ''; },
  } as unknown as ServerResponse;
  return {
    response,
    read: () => ({ statusCode, payload: payload ? JSON.parse(payload) as Record<string, any> : null }),
  };
};

const invoke = async (request: never, response: ServerResponse, database: unknown) => {
  try {
    await handleApi(request, response, database as never);
  } catch (error) {
    sendError(response, error);
  }
};

test('admin customer financial history uses charged order-item prices and collected payments', async () => {
  const orderDate = new Date('2026-09-24T10:15:20.000Z');
  const receivedAt = new Date('2026-09-25T06:10:30.000Z');
  const database = {
    user: {
      findUnique: async ({ include }: { include?: { customerAddresses?: unknown } }) => include?.customerAddresses
        ? { id: 'customer-a', name: 'Customer A', email: null, mobile: '9999999999', status: 'ACTIVE', roles: [{ role: { name: 'CUSTOMER' } }], customerAddresses: [{ id: 'address-a', line1: 'Farm Road', city: 'Jaipur', state: 'Rajasthan', postalCode: '302001' }] }
        : { id: 'admin-a', status: 'ACTIVE', roles: [{ role: { name: 'SUPER_ADMIN', permissions: [] } }] },
    },
    order: {
      findMany: async () => [{
        id: 'order-a',
        orderNumber: 'RF-1001',
        orderDate,
        createdAt: orderDate,
        totalAmount: '100.00',
        status: 'DELIVERED',
        items: [{ id: 'item-a', productNameSnapshot: 'Chicken', orderedQuantity: '2.000', unitPrice: '50.00', lineTotal: '100.00' }],
        payments: [
          { id: 'payment-a', amount: '60.00', method: 'CASH', status: 'CASH_COLLECTED', referenceNumber: null, receivedAt, paidAt: null, deliveryPartner: { name: 'Delivery A' }, receivedBy: null },
          { id: 'payment-b', amount: '40.00', method: 'UPI', status: 'UPI_COLLECTED', referenceNumber: 'UPI-123', receivedAt, paidAt: null, deliveryPartner: null, receivedBy: { name: 'Admin A' } },
        ],
        deliveries: [{ status: 'DELIVERED' }],
      }],
    },
  };
  const output = responseFor();
  await invoke(requestFor('admin-a', ['SUPER_ADMIN']), output.response, database);
  const result = output.read();
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.payload?.summary, { totalOrders: 1, totalOrderValue: 100, totalPaid: 100, outstanding: 0 });
  assert.equal(result.payload?.payments instanceof Array, true);
  assert.equal((result.payload?.payments as Array<Record<string, unknown>>)[1]?.referenceNumber, 'UPI-123');
  assert.equal((result.payload?.orders as Array<Record<string, any>>)[0]?.items[0]?.unitPrice, '50.00');
  assert.equal((result.payload?.orders as Array<Record<string, unknown>>)[0]?.outstanding, 0);
});

test('customer financial history is protected by users.read authorization', async () => {
  const database = {
    user: {
      findUnique: async () => ({ id: 'customer-a', status: 'ACTIVE', roles: [{ role: { name: 'CUSTOMER', permissions: [] } }] }),
    },
    order: { findMany: async () => { throw new Error('Customer data must not be queried'); } },
  };
  const output = responseFor();
  await invoke(requestFor('customer-a', ['CUSTOMER']), output.response, database);
  assert.equal(output.read().statusCode, 403);
});
