// Health check routes
import type { FastifyInstance } from 'fastify';

import { prisma } from '../db/prisma.js';

const healthResponseSchema = {
  type: 'object',
  required: ['status', 'timestamp'],
  properties: {
    status: { type: 'string', enum: ['ok', 'degraded'] },
    checks: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    timestamp: { type: 'string', format: 'date-time' },
  },
} as const;

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness - process is up
  app.get(
    '/health/live',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description: 'Returns ok when the API process is running.',
        response: { 200: healthResponseSchema },
      },
    },
    async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    }
  );

  // Readiness - dependencies are reachable
  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness probe',
        description: 'Checks that the API can reach PostgreSQL.',
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
    },
    async (_request, reply) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return {
          status: 'ok',
          checks: { database: 'ok' },
          timestamp: new Date().toISOString(),
        };
      } catch {
        reply.status(503);
        return {
          status: 'degraded',
          checks: { database: 'unavailable' },
          timestamp: new Date().toISOString(),
        };
      }
    }
  );

  // Simple health (for load balancers)
  app.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Simple health check',
        response: { 200: healthResponseSchema },
      },
    },
    async () => ({ status: 'ok', timestamp: new Date().toISOString() })
  );
}
