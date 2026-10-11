import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import type { ServerResponse } from 'node:http';
import { config } from '@farmmitra/config';
import { signAccessToken } from './auth.js';
import { sendError } from './http.js';
import { handleApi } from './routes.js';

const invoke = async (method: string, url: string, role: string, database: unknown, payload?: unknown) => {
  let statusCode = 0;
  let body = '';
  const response = {
    writeHead: (status: number) => { statusCode = status; },
    end: (value?: string) => { body = value ?? ''; },
  } as unknown as ServerResponse;
  const request = {
    method,
    url,
    headers: { authorization: `Bearer ${signAccessToken({ userId: 'user-a', roles: [role], permissions: [] })}` },
    async *[Symbol.asyncIterator]() {
      if (payload !== undefined) yield Buffer.from(JSON.stringify(payload));
    },
  };
  try {
    await handleApi(request as never, response, database as never);
  } catch (error) {
    sendError(response, error);
  }
  return { statusCode, payload: body ? JSON.parse(body) as Record<string, unknown> : null };
};

test('signed-in users can save each supported language as their own preference', async () => {
  const persisted: string[] = [];
  const database = {
    user: {
      findUnique: async () => ({ id: 'user-a', status: 'ACTIVE', roles: [{ role: { name: 'CUSTOMER', permissions: [] } }] }),
      update: async (input: unknown) => {
        const language = (input as { data: { preferredLanguage: string } }).data.preferredLanguage;
        persisted.push(language);
        return { id: 'user-a', name: 'Customer A', email: null, mobile: null, preferredLanguage: language, status: 'ACTIVE', roles: [{ role: { name: 'CUSTOMER' } }] };
      },
    },
  };
  for (const preferredLanguage of ['en', 'hi', 'hinglish']) {
    const result = await invoke('PATCH', '/api/v1/users/me/preferred-language', 'CUSTOMER', database, { preferredLanguage });
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload?.preferredLanguage, preferredLanguage);
  }
  assert.deepEqual(persisted, ['en', 'hi', 'hinglish']);
});

test('invalid and expired Bearer tokens do not persist language preferences', async () => {
  let updateCount = 0;
  const database = {
    user: {
      findUnique: async () => ({ id: 'user-a', status: 'ACTIVE', roles: [{ role: { name: 'CUSTOMER', permissions: [] } }] }),
      update: async () => { updateCount += 1; throw new Error('Unexpected persistence'); },
    },
  };
  const expiredToken = jwt.sign({ sub: 'user-a', roles: ['CUSTOMER'], permissions: [] }, config.JWT_SECRET, { expiresIn: -1 });
  for (const authorization of ['not-a-token', expiredToken]) {
    let statusCode = 0;
    let responseBody = '';
    const response = {
      writeHead: (status: number) => { statusCode = status; },
      end: (value?: string) => { responseBody = value ?? ''; },
    } as unknown as ServerResponse;
    const request = {
      method: 'PATCH',
      url: '/api/v1/users/me/preferred-language',
      headers: { authorization: `Bearer ${authorization}` },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify({ preferredLanguage: 'hi' }));
      },
    };
    try {
      await handleApi(request as never, response, database as never);
    } catch (error) {
      sendError(response, error);
    }
    assert.equal(statusCode, 401);
    assert.equal(JSON.parse(responseBody).error, 'Invalid or expired token');
  }
  assert.equal(updateCount, 0);
});

test('customers can only read their own Khata history', async () => {
  let queriedCustomerId = '';
  const user = {
    id: 'user-a', name: 'Customer A', email: null, mobile: null, preferredLanguage: 'en', status: 'ACTIVE',
    roles: [{ role: { name: 'CUSTOMER', permissions: [] } }],
  };
  const database = {
    user: {
      findUnique: async (input: { where: { id: string } }) => {
        queriedCustomerId = input.where.id;
        return { ...user, customerAddresses: [] };
      },
    },
    order: { findMany: async () => [] },
  };
  const result = await invoke('GET', '/api/v1/users/me/financial-history?page=1&pageSize=25', 'CUSTOMER', database);
  assert.equal(result.statusCode, 200);
  assert.equal(queriedCustomerId, 'user-a');
  assert.deepEqual(result.payload?.ledger, {
    summary: { openingBalance: 0, totalCharges: 0, totalPayments: 0, adjustments: 0, closingBalance: 0 },
    transactions: [],
    pagination: { page: 1, pageSize: 25, total: 0, pages: 1 },
  });

  const forbidden = await invoke('GET', '/api/v1/users/other-customer/financial-history', 'CUSTOMER', database);
  assert.equal(forbidden.statusCode, 403);
});
