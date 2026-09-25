import assert from 'node:assert/strict';
import test from 'node:test';
import type { ServerResponse } from 'node:http';
import { hashPassword, ROLE_NAMES, verifyPassword } from './auth.js';
import { isAllowedOrigin, sendError } from './http.js';
import { loginSchema, registerSchema } from './schemas.js';

test('password hashes are not plaintext and verify correctly', async () => {
  const password = 'correct horse battery staple';
  const passwordHash = await hashPassword(password);

  assert.notEqual(passwordHash, password);
  assert.equal(await verifyPassword(password, passwordHash), true);
  assert.equal(await verifyPassword('wrong password', passwordHash), false);
});

test('registration requires at least one login identifier', () => {
  const result = registerSchema.safeParse({ name: 'A User', password: 'password123' });
  assert.equal(result.success, false);
});

test('login accepts a single identifier and password', () => {
  const result = loginSchema.safeParse({ identifier: 'user@example.com', password: 'password123' });
  assert.equal(result.success, true);
});

test('marketplace roles are exposed for vendor, customer and delivery access', () => {
  assert.equal(ROLE_NAMES.includes('SUPER_ADMIN'), true);
  assert.equal(ROLE_NAMES.includes('VENDOR'), true);
  assert.equal(ROLE_NAMES.includes('CUSTOMER'), true);
  assert.equal(ROLE_NAMES.includes('DELIVERY_PARTNER'), true);
});

test('local storefront and admin origins are allowed for browser requests', () => {
  assert.equal(isAllowedOrigin('http://localhost:3000'), true);
  assert.equal(isAllowedOrigin('http://localhost:3001'), true);
  assert.equal(isAllowedOrigin('http://localhost:3003'), true);
  assert.equal(isAllowedOrigin('https://example.com'), false);
});

test('server errors strip stack traces and return a generic client-safe payload', () => {
  const chunks: Buffer[] = [];
  const response = {
    writeHead: (statusCode: number, headers: Record<string, string>) => {
      assert.equal(statusCode, 500);
      assert.equal(headers['content-type'], 'application/json; charset=utf-8');
    },
    end: (payload: string) => {
      chunks.push(Buffer.from(payload));
    },
  } as unknown as ServerResponse;

  sendError(response, new Error('Sensitive stack trace details'));

  const output = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.deepEqual(output, { error: 'Internal server error' });
});