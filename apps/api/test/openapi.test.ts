import {
  hotelMediaUpdateRequestSchema,
  hotelUpdateRequestSchema,
} from '@hotel-marketplace/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { apiSchema } from '../src/openapi/schema.js';

describe('OpenAPI documentation', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes a valid OpenAPI document', async () => {
    const document = app.swagger();
    expect(document.openapi).toBe('3.0.3');
    expect(document.info.title).toBe('Hotel Marketplace API');
    expect(document.info.version).toBe('0.1.0');
  });

  it('serves the OpenAPI JSON through the docs route', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.openapi).toBe('3.0.3');
    expect(body.paths).toBeDefined();
  });

  it('documents the health endpoints', async () => {
    const document = app.swagger();
    expect(Object.keys(document.paths ?? {})).toEqual(
      expect.arrayContaining(['/health', '/health/live', '/health/ready'])
    );
  });

  it('documents the partner and admin hotel endpoints', async () => {
    const document = app.swagger();
    // Route paths are relative to the /api/v1 server entry.
    expect(Object.keys(document.paths ?? {})).toEqual(
      expect.arrayContaining([
        '/partner/hotels',
        '/partner/hotels/{hotelId}',
        '/partner/hotels/{hotelId}/submit',
        '/partner/hotels/{hotelId}/media',
        '/partner/hotels/{hotelId}/media/{mediaId}',
        '/admin/hotels',
        '/admin/hotels/{hotelId}',
        '/admin/hotels/{hotelId}/review',
        '/admin/hotels/{hotelId}/approve',
        '/admin/hotels/{hotelId}/reject',
        '/admin/hotels/{hotelId}/suspend',
        '/admin/hotels/{hotelId}/reinstate',
      ])
    );
  });

  // Fastify's AJV runs with useDefaults, so a `default` in a PATCH schema would
  // overwrite stored values before the handler sees the body.
  it('keeps defaults out of PATCH request schemas', () => {
    expect(JSON.stringify(apiSchema(hotelUpdateRequestSchema))).not.toContain('"default"');
    expect(JSON.stringify(apiSchema(hotelMediaUpdateRequestSchema))).not.toContain('"default"');
  });
});
