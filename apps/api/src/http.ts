import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '@farmmitra/config';
import { HttpError } from './auth.js';

export type HttpRequest = IncomingMessage & { body?: unknown };

const defaultAllowedOrigins = [
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
];

export const getAllowedOrigins = (): Set<string> => {
  const rawOrigins = process.env.CORS_ALLOWED_ORIGINS ?? defaultAllowedOrigins.join(',');
  return new Set(rawOrigins.split(',').map((origin) => origin.trim()).filter(Boolean));
};

export const allowedOrigins = getAllowedOrigins();

export const isAllowedOrigin = (origin: string | undefined): boolean => Boolean(origin && allowedOrigins.has(origin));

export const setSecurityHeaders = (response: ServerResponse): void => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
};

export const readJson = async (request: IncomingMessage, maxBytes = config.MAX_REQUEST_BODY_BYTES): Promise<unknown> => {
  const contentLength = Number(request.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new HttpError(413, 'Request body too large');

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBytes) throw new HttpError(413, 'Request body too large');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
};

export const sendJson = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload, (key, value: unknown) => key === 'upiAccountLast4' ? undefined : value));
};

export const sendSensitiveJson = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
};

export const sendError = (response: ServerResponse, error: unknown): void => {
  if (error instanceof HttpError) {
    sendJson(response, error.statusCode, { error: error.message });
    return;
  }

  console.error('Unhandled API error:', error);
  sendJson(response, 500, { error: 'Internal server error' });
};

export const pathParts = (url: string | undefined): string[] => (url ?? '/').split('?')[0]!.split('/').filter(Boolean);



