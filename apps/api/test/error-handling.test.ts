import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

describe('error handling', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a consistent 404 error shape without internals', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });
    expect(response.statusCode).toBe(404);

    const body = response.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Route not found');
    expect(typeof body.error.requestId).toBe('string');
    expect(JSON.stringify(body)).not.toMatch(/stack|prisma|password/i);
  });

  it('echoes a provided request id', async () => {
    const requestId = '11111111-1111-4111-8111-111111111111';
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/does-not-exist',
      headers: { 'x-request-id': requestId },
    });
    expect(response.json().error.requestId).toBe(requestId);
  });

  it('ignores unsafe or oversized request ids', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/does-not-exist',
      headers: { 'x-request-id': 'bad\nheader-value' },
    });
    const requestId = response.json().error.requestId;
    expect(requestId).not.toContain('bad');
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('serves API metadata at /api/v1', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Hotel Marketplace API', version: '0.1.0' });
  });
});
