import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';

describe('VEDIXA Core Loop Integration Test', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DATABASE_URL'] = 'postgresql://vedixa:vedixa_dev@localhost:5432/vedixa_dev';
    process.env['JWT_SECRET'] = 'test-secret-at-least-32-characters-long!!';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-at-least-32-characters-long!!';
    process.env['ENCRYPTION_KEY'] = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    app = await buildApp();
  });

  it('GET /health returns 200 OK', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('VEDIXA');
  });

  it('rejects unauthenticated requests to protected endpoints', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/profile/me',
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('rejects malformed phone number requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phone: 'invalid-number' },
    });

    expect(res.statusCode).toBe(400);
  });
});
