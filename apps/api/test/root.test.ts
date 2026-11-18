import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

describe('root endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('redirects the root path to the API documentation', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/docs');
  });

  it('answers favicon requests without a 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/favicon.ico' });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });

  it('keeps browser-only routes out of the API documentation', async () => {
    const document = app.swagger();
    expect(document.paths?.['/favicon.ico']).toBeUndefined();
    expect(document.paths?.['/']?.get?.summary).toBe('API metadata');
  });
});
