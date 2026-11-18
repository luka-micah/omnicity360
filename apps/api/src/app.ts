// Fastify application factory
import { randomUUID } from 'node:crypto';

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';

import { env } from './config/env.js';
import { errorHandler, RateLimitError } from './errors/index.js';
import { adminHotelRoutes } from './routes/admin-hotels.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { partnerHotelRoutes } from './routes/partner-hotels.js';
import { publicBookingRoutes } from './routes/public-bookings.js';
import { staffRoutes } from './routes/staff.js';

export async function buildApp(options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: env.LOG_LEVEL,
            ...(env.NODE_ENV === 'development'
              ? {
                  transport: {
                    target: 'pino-pretty',
                    options: { translateTime: 'SYS:standard', ignore: 'pid,hostname' },
                  },
                }
              : {}),
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.currentPassword',
                'req.body.newPassword',
                'req.body.refreshToken',
                'req.body.token',
                'req.body.paymentMethodId',
                '*.passwordHash',
                '*.password',
                '*.secret',
                '*.token',
                '*.apiKey',
              ],
              censor: '[REDACTED]',
            },
            serializers: {
              req(request) {
                return {
                  method: request.method,
                  url: request.url,
                  id: request.id,
                  ip: request.ip,
                };
              },
              res(reply) {
                return { statusCode: reply.statusCode };
              },
            },
          },
    genReqId: (request) => {
      const existing = request.headers['x-request-id'];
      if (typeof existing === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(existing)) {
        return existing;
      }
      return randomUUID();
    },
    requestIdLogLabel: 'requestId',
    trustProxy: env.NODE_ENV === 'production',
    bodyLimit: 1_048_576, // 1 MB
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });

  // Cookie parsing for the HttpOnly refresh-token cookie
  await app.register(cookie);

  // CORS - only allow the configured web origin
  await app.register(cors, {
    origin: [env.WEB_BASE_URL],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
  });

  // Global rate limiting
  await app.register(rateLimit, {
    max: env.NODE_ENV === 'test' ? 10000 : 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) =>
      new RateLimitError(`Too many requests. Please try again in ${context.after}.`),
  });

  // OpenAPI documentation
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Omnicity360 API',
        description: 'Multi-city Nigeria hotel booking marketplace API',
        version: '0.1.0',
      },
      servers: [{ url: `${env.API_BASE_URL}/api/v1`, description: 'API v1' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'hm_refresh',
            description:
              'HttpOnly refresh-token cookie scoped to /api/v1/auth. Browser clients use it for refresh and logout.',
          },
        },
      },
      tags: [
        { name: 'Health', description: 'Service health checks' },
        { name: 'Auth', description: 'Authentication and sessions' },
        { name: 'Hotels', description: 'Hotel discovery and details' },
        { name: 'Availability', description: 'Availability search' },
        { name: 'Bookings', description: 'Quotes and bookings' },
        { name: 'Payments', description: 'Payment processing' },
        { name: 'Partner', description: 'Hotel partner operations' },
        { name: 'Admin', description: 'Platform administration' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  // Error handler: consistent error shape, no stack traces leaked
  app.setErrorHandler(errorHandler);

  // Not found handler
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        requestId: request.id,
      },
    });
  });

  // Friendly entry points for browsers. They are outside /api/v1 and hidden from the
  // versioned API documentation.
  app.get('/', { schema: { hide: true } }, async (_request, reply) => reply.redirect('/docs'));

  // Browsers request this automatically; answer quietly and keep it out of the docs.
  app.get('/favicon.ico', { schema: { hide: true } }, async (_request, reply) =>
    reply.status(204).send()
  );

  // Health routes (not under /api/v1)
  await app.register(healthRoutes);

  // API v1 routes
  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(meRoutes, { prefix: '/me' });
      await api.register(publicBookingRoutes);
      await api.register(partnerHotelRoutes, { prefix: '/partner' });
      await api.register(staffRoutes, { prefix: '/partner' });
      await api.register(adminHotelRoutes, { prefix: '/admin' });

      api.get(
        '/',
        {
          schema: {
            tags: ['Health'],
            summary: 'API metadata',
            response: {
              200: {
                type: 'object',
                required: ['name', 'version', 'docs'],
                properties: {
                  name: { type: 'string' },
                  version: { type: 'string' },
                  docs: { type: 'string' },
                },
              },
            },
          },
        },
        async () => ({
          name: 'Omnicity360 API',
          version: '0.1.0',
          docs: `${env.API_BASE_URL}/docs`,
        })
      );
    },
    { prefix: '/api/v1' }
  );

  return app;
}
