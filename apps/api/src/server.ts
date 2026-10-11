import { createServer } from 'node:http';
import { config } from '@farmmitra/config';
import { PrismaClient } from '@farmmitra/database';
import type { HealthStatus } from '@farmmitra/shared-types';
import { isAllowedOrigin, sendError, setSecurityHeaders } from './http.js';
import { createApiRateLimiter } from './rate-limit.js';
import { handleApi } from './routes.js';

const database = new PrismaClient();
const rateLimit = createApiRateLimiter(config);

const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
};

const server = createServer(async (request, response) => {
  try {
    setSecurityHeaders(response);
    const origin = request.headers.origin;

    if (typeof origin === 'string' && isAllowedOrigin(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
    }

    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.setHeader(key, value);
    });

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (rateLimit(request, response)) return;

    if (request.method === 'GET' && request.url === '/health') {
      let databaseStatus: HealthStatus['database'] = 'connected';

      try {
        await database.$queryRaw`SELECT 1`;
      } catch {
        databaseStatus = 'unavailable';
      }

      const payload: HealthStatus = {
        status: 'ok',
        service: 'farmmitra-api',
        timestamp: new Date().toISOString(),
        database: databaseStatus,
      };

      response.writeHead(
        databaseStatus === 'connected' ? 200 : 503,
        { 'content-type': 'application/json' }
      );

      response.end(JSON.stringify(payload));
      return;
    }

    if (await handleApi(request, response, database)) return;

    response.writeHead(404, {
      'content-type': 'application/json',
    });

    response.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    sendError(response, error);
  }
});

const shutdown = async (): Promise<void> => {
  await database.$disconnect();
  server.close();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(config.API_PORT, () => {
  console.log(`FarmMitra API listening on port ${config.API_PORT}`);
});
