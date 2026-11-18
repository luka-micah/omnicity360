// Hotel partner staff membership and invitation endpoints.
import {
  acceptStaffInvitationRequestSchema,
  inviteStaffRequestSchema,
  paginationParamsSchema,
  staffListResponseSchema,
  staffMemberSchema,
  uuidSchema,
} from '@hotel-marketplace/contracts';
import { AuditAction } from '@hotel-marketplace/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { writeAuditLog } from '../auth/audit.js';
import { authenticate, requireHotelAccess, requireHotelPermission } from '../auth/guard.js';
import { toStaffMember } from '../auth/serializers.js';
import { prisma } from '../db/prisma.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../errors/index.js';
import { apiSchema } from '../openapi/schema.js';

const hotelParamsSchema = z.object({ hotelId: uuidSchema });
const membershipParamsSchema = hotelParamsSchema.extend({ membershipId: uuidSchema });
const staffListQuerySchema = paginationParamsSchema.extend({
  status: z.enum(['pending', 'active', 'revoked']).optional(),
});

const STAFF_ROLES = ['manager', 'front_desk', 'inventory_manager', 'finance_viewer'] as const;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function staffRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/staff/invitations',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: {
        tags: ['Partner'],
        summary: 'Invite an existing user to a hotel staff role',
        security: [{ bearerAuth: [] }],
        body: apiSchema(inviteStaffRequestSchema),
        response: { 200: apiSchema(staffMemberSchema), 201: apiSchema(staffMemberSchema) },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const body = inviteStaffRequestSchema.parse(request.body);
      const access = await requireHotelAccess(request, body.hotelId);
      requireHotelPermission(access, 'manage_staff');

      const email = normalizeEmail(body.email);
      const invitee = await prisma.user.findUnique({ where: { email } });
      if (!invitee || !invitee.isActive) {
        throw new AppError('INVITEE_NOT_FOUND', 'No active account exists for this email', 422);
      }
      if (invitee.id === auth.user.id) {
        throw new ConflictError('CANNOT_INVITE_SELF', 'You are already a member of this hotel');
      }
      if (invitee.role === 'platform_admin') {
        throw new AppError('INVALID_INVITEE', 'Platform administrators cannot be hotel staff', 422);
      }

      const existing = await prisma.hotelMembership.findUnique({
        where: { hotelId_userId: { hotelId: body.hotelId, userId: invitee.id } },
      });
      if (existing?.status === 'active') {
        throw new ConflictError('MEMBERSHIP_ACTIVE', 'This user is already an active staff member');
      }

      let statusCode = 201;
      const membership = await prisma.$transaction(async (tx) => {
        const saved = existing
          ? await tx.hotelMembership.update({
              where: { id: existing.id },
              data: {
                role: body.role,
                status: 'pending',
                invitedBy: auth.user.id,
                acceptedAt: null,
              },
              include: {
                user: { select: { email: true, firstName: true, lastName: true } },
              },
            })
          : await tx.hotelMembership.create({
              data: {
                hotelId: body.hotelId,
                userId: invitee.id,
                role: body.role,
                status: 'pending',
                invitedBy: auth.user.id,
              },
              include: {
                user: { select: { email: true, firstName: true, lastName: true } },
              },
            });

        if (existing?.status === 'pending') statusCode = 200;

        await writeAuditLog(tx, request, {
          actorId: auth.user.id,
          actorType: auth.user.role,
          actorEmail: auth.user.email,
          action: AuditAction.STAFF_INVITED,
          entityType: 'hotel_membership',
          entityId: saved.id,
          metadata: {
            hotelId: body.hotelId,
            inviteeEmail: email,
            role: body.role,
          },
        });
        return saved;
      });

      reply.status(statusCode);
      return toStaffMember(membership);
    }
  );

  app.post(
    '/staff/invitations/accept',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: {
        tags: ['Partner'],
        summary: 'Accept a pending hotel staff invitation',
        security: [{ bearerAuth: [] }],
        body: apiSchema(acceptStaffInvitationRequestSchema),
        response: { 200: apiSchema(staffMemberSchema) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const body = acceptStaffInvitationRequestSchema.parse(request.body);
      const invitation = await prisma.hotelMembership.findFirst({
        where: { id: body.membershipId, userId: auth.user.id, status: 'pending' },
      });
      if (!invitation) throw new NotFoundError('Invitation');

      const membership = await prisma.$transaction(async (tx) => {
        const accepted = await tx.hotelMembership.update({
          where: { id: invitation.id },
          data: { status: 'active', acceptedAt: new Date() },
          include: {
            user: { select: { email: true, firstName: true, lastName: true } },
          },
        });

        if (auth.user.role === 'customer') {
          await tx.user.update({
            where: { id: auth.user.id },
            data: { role: 'hotel_staff' },
          });
        }

        await writeAuditLog(tx, request, {
          actorId: auth.user.id,
          actorType: auth.user.role,
          actorEmail: auth.user.email,
          action: AuditAction.STAFF_INVITATION_ACCEPTED,
          entityType: 'hotel_membership',
          entityId: accepted.id,
          metadata: { hotelId: accepted.hotelId, role: accepted.role },
        });
        return accepted;
      });

      return toStaffMember(membership);
    }
  );

  app.get(
    '/hotels/:hotelId/staff',
    {
      preHandler: authenticate,
      schema: {
        tags: ['Partner'],
        summary: 'List staff members for a hotel',
        security: [{ bearerAuth: [] }],
        params: apiSchema(hotelParamsSchema),
        querystring: apiSchema(staffListQuerySchema),
        response: { 200: apiSchema(staffListResponseSchema) },
      },
    },
    async (request) => {
      const { hotelId } = hotelParamsSchema.parse(request.params);
      const query = staffListQuerySchema.parse(request.query);
      const access = await requireHotelAccess(request, hotelId);
      requireHotelPermission(access, 'manage_staff');

      const where = {
        hotelId,
        role: { in: [...STAFF_ROLES] },
        ...(query.status ? { status: query.status } : {}),
      };
      const [total, memberships] = await prisma.$transaction([
        prisma.hotelMembership.count({ where }),
        prisma.hotelMembership.findMany({
          where,
          include: { user: { select: { email: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ]);

      return {
        data: memberships.map(toStaffMember),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    }
  );

  app.delete(
    '/hotels/:hotelId/staff/:membershipId',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
      schema: {
        tags: ['Partner'],
        summary: 'Revoke a hotel staff membership',
        security: [{ bearerAuth: [] }],
        params: apiSchema(membershipParamsSchema),
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { hotelId, membershipId } = membershipParamsSchema.parse(request.params);
      const access = await requireHotelAccess(request, hotelId);
      requireHotelPermission(access, 'manage_staff');

      const membership = await prisma.hotelMembership.findFirst({
        where: { id: membershipId, hotelId },
        include: { user: true },
      });
      if (!membership) throw new NotFoundError('Staff membership');
      if (membership.role === 'owner') {
        throw new ConflictError('CANNOT_REVOKE_OWNER', 'Hotel ownership cannot be revoked here');
      }
      if (membership.userId === auth.user.id) {
        throw new ForbiddenError('You cannot revoke your own membership');
      }
      if (membership.status === 'revoked') return reply.status(204).send();

      await prisma.$transaction(async (tx) => {
        await tx.hotelMembership.update({
          where: { id: membership.id },
          data: { status: 'revoked' },
        });

        if (membership.user.role === 'hotel_staff') {
          const remaining = await tx.hotelMembership.count({
            where: {
              userId: membership.userId,
              status: 'active',
              id: { not: membership.id },
            },
          });
          if (remaining === 0) {
            await tx.user.update({
              where: { id: membership.userId },
              data: { role: 'customer' },
            });
          }
        }

        await writeAuditLog(tx, request, {
          actorId: auth.user.id,
          actorType: auth.user.role,
          actorEmail: auth.user.email,
          action: AuditAction.STAFF_REVOKED,
          entityType: 'hotel_membership',
          entityId: membership.id,
          metadata: { hotelId, role: membership.role },
          severity: 'warning',
        });
      });

      return reply.status(204).send();
    }
  );
}
