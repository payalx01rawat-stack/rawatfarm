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
  FRONTEND_ORIGIN: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
});

export type Environment = z.infer<typeof environmentSchema>;
