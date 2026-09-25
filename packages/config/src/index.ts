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
});
