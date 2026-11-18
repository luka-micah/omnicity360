// Current-user profile, session, and membership endpoints.
import {
  meProfileResponseSchema,
  myMembershipsResponseSchema,
  sessionListResponseSchema,
  updateProfileRequestSchema,
} from '@hotel-marketplace/contracts';
import { AuditAction } from '@hotel-marketplace/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { writeAuditLog } from '../auth/audit.js';
import { authenticate } from '../auth/guard.js';
import { toMeProfile, toSession } from '../auth/serializers.js';
import { clearRefreshCookie } from '../auth/tokens.js';
import { prisma } from '../db/prisma.js';
import { NotFoundError } from '../errors/index.js';
import { apiSchema } from '../openapi/schema.js';

const sessionParamsSchema = z.object({ sessionId: z.string().uuid() });

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/profile',
    {
      preHandler: authenticate,
      schema: {
        tags: ['Auth'],
        summary: 'Get the current user profile',
        security: [{ bearerAuth: [] }],
        response: { 200: apiSchema(meProfileResponseSchema) },
      },
    },
    async (request) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: request.auth!.user.id },
        include: { customerProfile: true, partnerProfile: true },
      });
      return toMeProfile(user);
    }
  );

  app.patch(
    '/profile',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Update the current user profile',
        security: [{ bearerAuth: [] }],
        body: apiSchema(updateProfileRequestSchema),
        response: { 200: apiSchema(meProfileResponseSchema) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const body = updateProfileRequestSchema.parse(request.body);

      const userData: { firstName?: string; lastName?: string; phone?: string | null } = {};
      if (body.firstName !== undefined) userData.firstName = body.firstName;
      if (body.lastName !== undefined) userData.lastName = body.lastName;
      if (body.phone !== undefined) userData.phone = body.phone;

      const profileData: Record<string, unknown> = {};
      if (body.dateOfBirth !== undefined) {
        profileData.dateOfBirth =
          body.dateOfBirth === null ? null : new Date(`${body.dateOfBirth}T00:00:00.000Z`);
      }
      if (body.nationality !== undefined) {
        profileData.nationality = body.nationality === null ? null : body.nationality.toUpperCase();
      }
      if (body.addressLine1 !== undefined) profileData.addressLine1 = body.addressLine1;
      if (body.addressLine2 !== undefined) profileData.addressLine2 = body.addressLine2;
      if (body.city !== undefined) profileData.city = body.city;
      if (body.state !== undefined) profileData.state = body.state;
      if (body.postalCode !== undefined) profileData.postalCode = body.postalCode;
      if (body.marketingOptIn !== undefined) profileData.marketingOptIn = body.marketingOptIn;

      const user = await prisma.$transaction(async (tx) => {
        if (Object.keys(userData).length > 0) {
          await tx.user.update({ where: { id: auth.user.id }, data: userData });
        }
        if (Object.keys(profileData).length > 0) {
          await tx.customerProfile.upsert({
            where: { userId: auth.user.id },
            update: profileData,
            create: { userId: auth.user.id, ...profileData },
          });
        }
        return tx.user.findUniqueOrThrow({
          where: { id: auth.user.id },
          include: { customerProfile: true, partnerProfile: true },
        });
      });

      return toMeProfile(user);
    }
  );

  app.get(
    '/sessions',
    {
      preHandler: authenticate,
      schema: {
        tags: ['Auth'],
        summary: 'List active sessions for the current user',
        security: [{ bearerAuth: [] }],
        response: { 200: apiSchema(sessionListResponseSchema) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const sessions = await prisma.userSession.findMany({
        where: {
          userId: auth.user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { lastUsedAt: 'desc' },
      });
      return { data: sessions.map((session) => toSession(session, auth.sessionId)) };
    }
  );

  app.delete(
    '/sessions/:sessionId',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Revoke one of the current user sessions',
        security: [{ bearerAuth: [] }],
        params: apiSchema(sessionParamsSchema),
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { sessionId } = sessionParamsSchema.parse(request.params);
      const session = await prisma.userSession.findFirst({
        where: { id: sessionId, userId: auth.user.id },
      });
      if (!session) throw new NotFoundError('Session');

      if (session.revokedAt === null) {
        await prisma.$transaction(async (tx) => {
          await tx.userSession.update({
            where: { id: session.id },
            data: { revokedAt: new Date() },
          });
          await writeAuditLog(tx, request, {
            actorId: auth.user.id,
            actorType: auth.user.role,
            actorEmail: auth.user.email,
            action: AuditAction.SESSION_REVOKED,
            entityType: 'user_session',
            entityId: session.id,
          });
        });
      }
      if (session.id === auth.sessionId) clearRefreshCookie(reply);
      return reply.status(204).send();
    }
  );

  app.get(
    '/memberships',
    {
      preHandler: authenticate,
      schema: {
        tags: ['Auth'],
        summary: 'List hotel memberships for the current user',
        security: [{ bearerAuth: [] }],
        response: { 200: apiSchema(myMembershipsResponseSchema) },
      },
    },
    async (request) => {
      const memberships = await prisma.hotelMembership.findMany({
        where: { userId: request.auth!.user.id },
        include: { hotel: { select: { name: true, slug: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return {
        data: memberships.map((membership) => ({
          id: membership.id,
          hotelId: membership.hotelId,
          hotelName: membership.hotel.name,
          hotelSlug: membership.hotel.slug,
          role: membership.role,
          status: membership.status,
          acceptedAt: membership.acceptedAt ? membership.acceptedAt.toISOString() : null,
        })),
      };
    }
  );
}
