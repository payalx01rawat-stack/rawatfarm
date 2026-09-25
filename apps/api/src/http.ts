import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from './auth.js';

export type HttpRequest = IncomingMessage & { body?: unknown };

const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3003',
  'http://127.0.0.1:3004',
];

export const getAllowedOrigins = (): Set<string> => {
  const rawOrigins = process.env.CORS_ALLOWED_ORIGINS ?? defaultAllowedOrigins.join(',');
  return new Set(rawOrigins.split(',').map((origin) => origin.trim()).filter(Boolean));
};

export const allowedOrigins = getAllowedOrigins();

export const isAllowedOrigin = (origin: string | undefined): boolean => Boolean(origin && allowedOrigins.has(origin));

export const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
};

export const sendJson = (response: ServerResponse, statusCode: number, payload: unknown): void => {
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




