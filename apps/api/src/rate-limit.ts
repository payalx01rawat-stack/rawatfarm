import type { IncomingMessage, ServerResponse } from 'node:http';
import { pathParts, sendJson } from './http.js';

type RateLimitConfig = {
  RATE_LIMIT_WINDOW_MS: number;
  API_RATE_LIMIT_MAX: number;
  AUTH_RATE_LIMIT_MAX: number;
  PAYMENT_RATE_LIMIT_MAX: number;
  TRUST_PROXY: boolean;
};

type Bucket = { count: number; resetAt: number };
type Policy = { name: string; maximum: number; windowMs: number };

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private requestsSinceCleanup = 0;

  consume(key: string, maximum: number, windowMs: number, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    this.requestsSinceCleanup += 1;
    if (this.requestsSinceCleanup >= 256 || this.buckets.size >= 100_000) this.cleanup(now);

    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return {
      allowed: bucket.count <= maximum,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  private cleanup(now: number): void {
    this.requestsSinceCleanup = 0;
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
    while (this.buckets.size >= 100_000) this.buckets.delete(this.buckets.keys().next().value!);
  }
}

const clientAddress = (request: IncomingMessage, trustProxy: boolean): string => {
  if (trustProxy) {
    const forwardedFor = request.headers['x-forwarded-for'];
    const firstAddress = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)?.split(',')[0]?.trim();
    if (firstAddress && firstAddress.length <= 128) return firstAddress;
  }
  return request.socket.remoteAddress ?? 'unknown';
};

const policiesFor = (request: IncomingMessage, config: RateLimitConfig): Policy[] => {
  const parts = pathParts(request.url);
  if (parts[0] !== 'api' || parts[1] !== 'v1') return [];

  const policies: Policy[] = [{ name: 'api', maximum: config.API_RATE_LIMIT_MAX, windowMs: config.RATE_LIMIT_WINDOW_MS }];
  if (request.method === 'POST' && parts[2] === 'auth' && ['login', 'register'].includes(parts[3] ?? '')) {
    policies.push({ name: 'auth', maximum: config.AUTH_RATE_LIMIT_MAX, windowMs: config.RATE_LIMIT_WINDOW_MS });
  }
  if (request.method === 'POST' && (parts[5] === 'collect-payment' || (parts[2] === 'marketplace' && parts[3] === 'delivery' && parts[4] === 'orders' && parts[6] === 'complete'))) {
    policies.push({ name: 'payment', maximum: config.PAYMENT_RATE_LIMIT_MAX, windowMs: config.RATE_LIMIT_WINDOW_MS });
  }
  return policies;
};

export const createApiRateLimiter = (config: RateLimitConfig, limiter = new FixedWindowRateLimiter()) => (
  request: IncomingMessage,
  response: ServerResponse,
): boolean => {
  const address = clientAddress(request, config.TRUST_PROXY);
  for (const policy of policiesFor(request, config)) {
    const result = limiter.consume(`${policy.name}:${address}`, policy.maximum, policy.windowMs);
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      sendJson(response, 429, { error: 'Too many requests' });
      return true;
    }
  }
  return false;
};