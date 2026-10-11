import { z } from 'zod';

const defaultLocalCorsOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3003',
  'http://127.0.0.1:3004',
].join(',');

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  CORS_ALLOWED_ORIGINS: z.string().default(defaultLocalCorsOrigins),
  API_BASE_URL: z.string().default('http://localhost:4000'),
  NEXT_PUBLIC_API_BASE_URL: z.string().default('http://localhost:4000'),
  MAX_REQUEST_BODY_BYTES: z.coerce.number().int().positive().default(1_048_576),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  PAYMENT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  FRONTEND_ORIGIN: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
}).superRefine((environment, context) => {
  if (environment.NODE_ENV !== 'production') return;

  for (const key of ['API_BASE_URL', 'NEXT_PUBLIC_API_BASE_URL'] as const) {
    try {
      const url = new URL(environment[key]);
      if (url.protocol !== 'https:' || url.origin !== environment[key].replace(/\/$/, '')) throw new Error();
    } catch {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} must be an explicit HTTPS origin in production` });
    }
  }

  const origins = environment.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0 || origins.some((origin) => {
    try {
      const url = new URL(origin);
      return url.protocol !== 'https:' || url.origin !== origin || ['localhost', '127.0.0.1'].includes(url.hostname) || origin === '*';
    } catch {
      return true;
    }
  })) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['CORS_ALLOWED_ORIGINS'], message: 'Production CORS origins must be explicit HTTPS origins without localhost or wildcards' });
  }
});

export type Environment = z.infer<typeof environmentSchema>;
