import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { environmentSchema } from '@farmmitra/validation';

dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), '../../.env'), override: false });

export const config = environmentSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  API_PORT: process.env.API_PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
  API_BASE_URL: process.env.API_BASE_URL,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  MAX_REQUEST_BODY_BYTES: process.env.MAX_REQUEST_BODY_BYTES,
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
  API_RATE_LIMIT_MAX: process.env.API_RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_MAX: process.env.AUTH_RATE_LIMIT_MAX,
  PAYMENT_RATE_LIMIT_MAX: process.env.PAYMENT_RATE_LIMIT_MAX,
  TRUST_PROXY: process.env.TRUST_PROXY,
});
