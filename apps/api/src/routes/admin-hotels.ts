// Admin hotel review, approval, suspension, and reinstatement endpoints.
import {
  adminHotelDetailResponseSchema,
  adminHotelListParamsSchema,
  adminHotelListResponseSchema,
  hotelApproveRequestSchema,
  hotelRejectRequestSchema,
  hotelReinstateRequestSchema,
  hotelReviewRequestSchema,
  hotelSuspendRequestSchema,
  uuidSchema,
} from '@hotel-marketplace/contracts';
import { AuditAction, UserRole } from '@hotel-marketplace/domain';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { authenticate, requireRoles } from '../auth/guard.js';
import { prisma } from '../db/prisma.js';
import { ConflictError, NotFoundError } from '../errors/index.js';
import { appendInternalNote, applyHotelTransition } from '../hotels/lifecycle.js';
import { toAdminHotel, toAdminHotelListItem } from '../hotels/serializers.js';
import { apiSchema } from '../openapi/schema.js';

const hotelParamsSchema = z.object({ hotelId: uuidSchema });

const HOTEL_DETAILS_INCLUDE = {
  images: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
  documents: { orderBy: { uploadedAt: 'asc' as const } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  partner: { select: { id: true, email: true, firstName: true, lastName: true } },
} satisfies Prisma.HotelInclude;

const HOTEL_LIST_INCLUDE = {
  images: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
  _count: { select: { documents: true } },
  partner: { select: { id: true, email: true, firstName: true, lastName: true } },
} satisfies Prisma.HotelInclude;

function buildListWhere(
  query: ReturnType<typeof adminHotelListParamsSchema.parse>
): Prisma.HotelWhereInput {
  const search = query.search?.trim();
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.city ? { city: { contains: query.city, mode: 'insensitive' } } : {}),
    ...(query.state ? { state: { contains: query.state, mode: 'insensitive' } } : {}),
    ...(query.partnerId ? { partnerId: query.partnerId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { slug: { contains: search, mode: 'insensitive' as const } },
            { city: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}

function buildOrderBy(
  query: ReturnType<typeof adminHotelListParamsSchema.parse>
): Prisma.HotelOrderByWithRelationInput {
  const direction = query.sortOrder ?? 'desc';
  switch (query.sortBy) {
    case 'name':
      return { name: direction };
    case 'city':
      return { city: direction };
    case 'status':
      return { status: direction };
    default:
      return { createdAt: direction };
  }
}

async function loadHotel(hotelId: string) {
  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    include: HOTEL_DETAILS_INCLUDE,
  });
  if (!hotel) throw new NotFoundError('Hotel');
  return hotel;
}

function assertStatus(
  hotel: { id: string; status: string },
  expected: readonly string[],
  action: string
): void {
  if (!expected.includes(hotel.status)) {
    throw new ConflictError(
      'HOTEL_INVALID_TRANSITION',
      `Cannot ${action} a hotel in status ${hotel.status}`
    );
  }
}

function platformAdminOnly() {
  return [authenticate, requireRoles(UserRole.PLATFORM_ADMIN)];
}

export async function adminHotelRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/hotels',
    {
      preHandler: platformAdminOnly(),
      schema: {
        tags: ['Admin'],
        summary: 'List hotels with review filters',
        security: [{ bearerAuth: [] }],
        querystring: apiSchema(adminHotelListParamsSchema),
        response: { 200: apiSchema(adminHotelListResponseSchema) },
      },
    },
    async (request) => {
      const query = adminHotelListParamsSchema.parse(request.query);
      const where = buildListWhere(query);

      const [total, hotels] = await prisma.$transaction([
        prisma.hotel.count({ where }),
        prisma.hotel.findMany({
          where,
          include: HOTEL_LIST_INCLUDE,
          orderBy: buildOrderBy(query),
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ]);

      return {
        data: hotels.map((hotel) => toAdminHotelListItem(hotel, hotel.partner)),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    }
  );

  app.get(
    '/hotels/:hotelId',
    {
      preHandler: platformAdminOnly(),
      schema: {
        tags: ['Admin'],
        summary: 'Get a hotel with documents, history, and internal notes',
        security: [{ bearerAuth: [] }],
        params: apiSchema(hotelParamsSchema),
        response: { 200: apiSchema(adminHotelDetailResponseSchema) },
      },
    },
    async (request) => {
      const { hotelId } = hotelParamsSchema.parse(request.params);
      const hotel = await loadHotel(hotelId);
      return toAdminHotel(hotel, hotel.partner);
    }
  );

  app.post(
    '/hotels/:hotelId/review',
    {
      preHandler: platformAdminOnly(),
      config: { rateLimit: { max: 120, timeWindow: '1 hour' } },
      schema: {
        tags: ['Admin'],
        summary: 'Move a submitted hotel into review',
        security: [{ bearerAuth: [] }],
        params: apiSchema(hotelParamsSchema),
        body: apiSchema(hotelReviewRequestSchema),
        response: { 200: apiSchema(adminHotelDetailResponseSchema) },
      },
    },
    async (request) => {
      const { hotelId } = hotelParamsSchema.parse(request.params);
      const body = hotelReviewRequestSchema.parse(request.body ?? {});
      const hotel = await loadHotel(hotelId);

      assertStatus(hotel, ['submitted'], 'review');

      await prisma.$transaction(async (tx) => {
        await applyHotelTransition(tx, request, {
          hotel,
          to: 'under_review',
          action: AuditAction.HOTEL_REVIEW_STARTED,
          notes: body.notes ?? null,
          data: {
            internalNotes: appendInternalNote(
              hotel.internalNotes,
              request.auth!.user.email,
              body.notes
            ),
          },
        });
      });

      const refreshed = await loadHotel(hotelId);
      return toAdminHotel(refreshed, refreshed.partner);
    }
  );

  app.post(
    '/hotels/:hotelId/approve',
    {
      preHandler: platformAdminOnly(),
      config: { rateLimit: { max: 120, timeWindow: '1 hour' } },
      schema: {
        tags: ['Admin'],
        summary: 'Approve a hotel that is under review',
        security: [{ bearerAuth: [] }],
        params: apiSchema(hotelParamsSchema),
        body: apiSchema(hotelApproveRequestSchema),
        response: { 200: apiSchema(adminHotelDetailResponseSchema) },
      },
    },
    async (request) => {
      const { hotelId } = hotelParamsSchema.parse(request.params);
      const body = hotelApproveRequestSchema.parse(request.body ?? {});
      const hotel = await loadHotel(hotelId);

      assertStatus(hotel, ['under_review'], 'approve');

      await prisma.$transaction(async (tx) => {
        await applyHotelTransition(tx, request, {
          hotel,
          to: 'approved',
          action: AuditAction.HOTEL_APPROVED,
          notes: body.notes ?? null,
          severity: 'warning',
          data: {
            approvedAt: new Date(),
            approvedBy: request.auth!.user.id,
            rejectionReason: null,
            internalNotes: appendInternalNote(
              hotel.internalNotes,
              request.auth!.user.email,
              body.notes
            ),
            ...(body.commissionBps !== undefined
              ? { defaultCommissionBps: body.commissionBps }
              : {}),
          },
          metadata:
            body.commissionBps !== undefined ? { commissionBps: body.commissionBps } : undefined,
        });
      });

      const refreshed = await loadHotel(hotelId);
      return toAdminHotel(refreshed, refreshed.partner);
    }
  );

  app.post(
    '/hotels/:hotelId/reject',
    {
      preHandler: platformAdminOnly(),
      config: { rateLimit: { max: 120, timeWindow: '1 hour' } },
      schema: {
        tags: ['Admin'],
        summary: 'Reject a hotel that is under review',
        security: [{ bearerAuth: [] }],
        params: apiSchema(hotelParamsSchema),
        body: apiSchema(hotelRejectRequestSchema),
        response: { 200: apiSchema(adminHotelDetailResponseSchema) },
      },
    },
    async (request) => {
      const { hotelId } = hotelParamsSchema.parse(request.params);
      const body = hotelRejectRequestSchema.parse(request.body ?? {});
      const hotel = await loadHotel(hotelId);

      assertStatus(hotel, ['under_review'], 'reject');

      await prisma.$transaction(async (tx) => {
        await applyHotelTransition(tx, request, {
          hotel,
          to: 'rejected',
          action: AuditAction.HOTEL_REJECTED,
          reason: body.rejectionReason,
          notes: body.notes ?? null,
          severity: 'warning',
          data: {
            rejectionReason: body.rejectionReason,
            internalNotes: appendInternalNote(
              hotel.internalNotes,
              request.auth!.user.email,
              body.notes
            ),
          },
        });
      });

      const refreshed = await loadHotel(hotelId);
      return toAdminHotel(refreshed, refreshed.partner);
    }
  );

  app.post(
    '/hotels/:hotelId/suspend',
    {
      preHandler: platformAdminOnly(),
      config: { rateLimit: { max: 120, timeWindow: '1 hour' } },
      schema: {
        tags: ['Admin'],
        summary: 'Suspend an approved hotel',
        security: [{ bearerAuth: [] }],
        params: apiSchema(hotelParamsSchema),
        body: apiSchema(hotelSuspendRequestSchema),
        response: { 200: apiSchema(adminHotelDetailResponseSchema) },
      },
    },
    async (request) => {
      const { hotelId } = hotelParamsSchema.parse(request.params);
      const body = hotelSuspendRequestSchema.parse(request.body ?? {});
      const hotel = await loadHotel(hotelId);

      assertStatus(hotel, ['approved'], 'suspend');

      await prisma.$transaction(async (tx) => {
        await applyHotelTransition(tx, request, {
          hotel,
          to: 'suspended',
          action: AuditAction.HOTEL_SUSPENDED,
          reason: body.reason,
          severity: 'warning',
          data: {
            suspendedAt: new Date(),
            internalNotes: appendInternalNote(
              hotel.internalNotes,
              request.auth!.user.email,
              body.reason
            ),
          },
          // Email delivery is deferred to Phase 7; the preference is recorded only.
          metadata: { notifyPartner: body.notifyPartner },
        });
      });

      const refreshed = await loadHotel(hotelId);
      return toAdminHotel(refreshed, refreshed.partner);
    }
  );

  app.post(
    '/hotels/:hotelId/reinstate',
    {
      preHandler: platformAdminOnly(),
      config: { rateLimit: { max: 120, timeWindow: '1 hour' } },
      schema: {
        tags: ['Admin'],
        summary: 'Reinstate a suspended hotel',
        security: [{ bearerAuth: [] }],
        params: apiSchema(hotelParamsSchema),
        body: apiSchema(hotelReinstateRequestSchema),
        response: { 200: apiSchema(adminHotelDetailResponseSchema) },
      },
    },
    async (request) => {
      const { hotelId } = hotelParamsSchema.parse(request.params);
      const body = hotelReinstateRequestSchema.parse(request.body ?? {});
      const hotel = await loadHotel(hotelId);

      assertStatus(hotel, ['suspended'], 'reinstate');

      await prisma.$transaction(async (tx) => {
        await applyHotelTransition(tx, request, {
          hotel,
          to: 'approved',
          action: AuditAction.HOTEL_REINSTATED,
          notes: body.notes ?? null,
          severity: 'warning',
          data: {
            suspendedAt: null,
            internalNotes: appendInternalNote(
              hotel.internalNotes,
              request.auth!.user.email,
              body.notes
            ),
          },
        });
      });

      const refreshed = await loadHotel(hotelId);
      return toAdminHotel(refreshed, refreshed.partner);
    }
  );
}
