import assert from 'node:assert/strict';
import test from 'node:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { environmentSchema } from '@farmmitra/validation';
import { HttpError } from './auth.js';
import { readJson, setSecurityHeaders } from './http.js';
import { createApiRateLimiter, FixedWindowRateLimiter } from './rate-limit.js';

const limiterConfig = {
  RATE_LIMIT_WINDOW_MS: 60_000,
  API_RATE_LIMIT_MAX: 100,
  AUTH_RATE_LIMIT_MAX: 1,
  PAYMENT_RATE_LIMIT_MAX: 1,
  TRUST_PROXY: false,
};

const responseFor = () => {
  const headers: Record<string, string> = {};
  let statusCode = 0;
  let payload = '';
  const response = {
    setHeader: (name: string, value: string) => { headers[name] = value; },
    writeHead: (status: number) => { statusCode = status; },
    end: (body?: string) => { payload = body ?? ''; },
  } as unknown as ServerResponse;
  return { response, headers, read: () => ({ statusCode, payload }) };
};

const requestFor = (url: string): IncomingMessage => ({
  method: 'POST',
  url,
  headers: {},
  socket: { remoteAddress: '192.0.2.10' },
} as unknown as IncomingMessage);

test('API rate limiting returns 429 and Retry-After for login and payment quotas', () => {
  const rateLimit = createApiRateLimiter(limiterConfig, new FixedWindowRateLimiter());
  for (const url of ['/api/v1/auth/login', '/api/v1/marketplace/orders/order-a/collect-payment']) {
    assert.equal(rateLimit(requestFor(url), responseFor().response), false);
    const output = responseFor();
    assert.equal(rateLimit(requestFor(url), output.response), true);
    assert.equal(output.read().statusCode, 429);
    assert.deepEqual(JSON.parse(output.read().payload), { error: 'Too many requests' });
    assert.match(output.headers['Retry-After'] ?? '', /^\d+$/);
  }

  const generalRateLimit = createApiRateLimiter({ ...limiterConfig, API_RATE_LIMIT_MAX: 2 }, new FixedWindowRateLimiter());
  const generalRequest = requestFor('/api/v1/products');
  assert.equal(generalRateLimit(generalRequest, responseFor().response), false);
  assert.equal(generalRateLimit(generalRequest, responseFor().response), false);
  const limited = responseFor();
  assert.equal(generalRateLimit(generalRequest, limited.response), true);
  assert.equal(limited.read().statusCode, 429);
});

test('API rate limiter resets expired windows', () => {
  const limiter = new FixedWindowRateLimiter();
  assert.equal(limiter.consume('client', 1, 1000, 0).allowed, true);
  assert.equal(limiter.consume('client', 1, 1000, 1).allowed, false);
  assert.equal(limiter.consume('client', 1, 1000, 1000).allowed, true);
});

test('oversized streamed JSON bodies are rejected with 413', async () => {
  const request = {
    headers: {},
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('{"payload":"');
      yield Buffer.from('exceeds limit"}');
    },
  } as unknown as IncomingMessage;
  await assert.rejects(readJson(request, 16), (error: unknown) => error instanceof HttpError && error.statusCode === 413);
});

test('API security headers are set on responses', () => {
  const output = responseFor();
  setSecurityHeaders(output.response);
  assert.equal(output.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(output.headers['X-Frame-Options'], 'DENY');
  assert.equal(output.headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
});

test('production environment requires explicit HTTPS origins and URLs', () => {
  const required = {
    NODE_ENV: 'production',
    DATABASE_URL: 'mysql://test:test@db.example.test/farmmitra',
    REDIS_URL: 'redis://cache.example.test:6379',
    JWT_SECRET: 'test-only-secret-value-that-is-not-a-production-credential',
  };
  assert.equal(environmentSchema.safeParse({
    ...required,
    API_BASE_URL: 'https://api.example.test',
    NEXT_PUBLIC_API_BASE_URL: 'https://api.example.test',
    CORS_ALLOWED_ORIGINS: 'https://shop.example.test,https://admin.example.test',
  }).success, true);
  assert.equal(environmentSchema.safeParse(required).success, false);
  assert.equal(environmentSchema.safeParse({
    ...required,
    API_BASE_URL: 'http://localhost:4000',
    NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
  }).success, false);
});