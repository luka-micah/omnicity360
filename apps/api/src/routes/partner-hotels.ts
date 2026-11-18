// Partner hotel onboarding: create, list, detail, update, submit, and media metadata.
import {
  hotelCreateRequestSchema,
  hotelMediaCreateRequestSchema,
  hotelMediaParamsSchema,
  hotelMediaResponseSchema,
  hotelMediaUpdateRequestSchema,
  hotelSubmitRequestSchema,
  hotelUpdateRequestSchema,
  partnerHotelListResponseSchema,
  partnerHotelQuerySchema,
  partnerHotelResponseSchema,
  uuidSchema,
} from '@hotel-marketplace/contracts';
import { AuditAction, UserRole, slugify } from '@hotel-marketplace/domain';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { writeAuditLog } from '../auth/audit.js';
import {
  authenticate,
  requireHotelAccess,
  requireHotelPermission,
  requireRoles,
  type AuthContext,
} from '../auth/guard.js';
import { prisma } from '../db/prisma.js';
import { ConflictError, NotFoundError } from '../errors/index.js';
import {
  applyHotelTransition,
  assertPartnerEditable,
  canSubmitHotel,
} from '../hotels/lifecycle.js';
import { toHotelMedia, toPartnerHotel } from '../hotels/serializers.js';
import { isUniqueConstraintError, randomSlugCandidate, resolveHotelSlug } from '../hotels/slug.js';
import { apiSchema } from '../openapi/schema.js';

const hotelParamsSchema = z.object({ hotelId: uuidSchema });

const HOTEL_DETAILS_INCLUDE = {
  images: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
  documents: { orderBy: { uploadedAt: 'asc' as const } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.HotelInclude;

/** Statuses where a partner may still change the public slug. */
const SLUG_EDITABLE_STATUSES: readonly string[] = ['draft', 'rejected'];

function buildHotelData(
  body: ReturnType<typeof hotelCreateRequestSchema.parse>,
  partnerId: string
): Omit<Prisma.HotelUncheckedCreateInput, 'slug'> {
  return {
    partnerId,
    name: body.name,
    description: body.description ?? null,
    propertyType: body.propertyType,
    addressLine1: body.address.line1,
    addressLine2: body.address.line2 ?? null,
    city: body.address.city,
    state: body.address.state,
    country: body.address.country,
    postalCode: body.address.postalCode ?? null,
    latitude: body.address.coordinates?.latitude ?? null,
    longitude: body.address.coordinates?.longitude ?? null,
    contactEmail: body.contact.email ?? null,
    contactPhone: body.contact.phone ?? null,
    contactWebsite: body.contact.website ?? null,
    checkInTime: body.checkInTime,
    checkOutTime: body.checkOutTime,
    amenities: body.amenities,
    houseRules: body.houseRules ?? null,
    accessibilityInfo: body.accessibilityInfo ?? null,
    status: 'draft',
  };
}

export async function partnerHotelRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/hotels',
    {
      preHandler: [authenticate, requireRoles(UserRole.HOTEL_OWNER)],
      config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
      schema: {
        tags: ['Partner'],
        summary: 'Create a draft hotel for the authenticated partner',
        security: [{ bearerAuth: [] }],
        body: apiSchema(hotelCreateRequestSchema),
        response: { 201: apiSchema(partnerHotelResponseSchema) },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const body = hotelCreateRequestSchema.parse(request.body);

      const explicitSlug = body.slug;
      const baseSlug = explicitSlug ?? slugify(body.name);
      let slug = await resolveHotelSlug({ slug: explicitSlug, name: body.name });

      reply.status(201);

      for (let attempt = 0; ; attempt++) {
        try {
          const created = await prisma.$transaction(async (tx) => {
            const hotel = await tx.hotel.create({
              data: {
                ...buildHotelData(body, auth.user.id),
                slug,
                memberships: {
                  create: {
                    userId: auth.user.id,
                    role: 'owner',
                    status: 'active',
                    acceptedAt: new Date(),
                  },
                },
                statusHistory: {
                  create: {
                    fromStatus: null,
                    toStatus: 'draft',
                    actorId: auth.user.id,
                    actorType: 'user',
                    notes: 'Hotel created',
                  },
                },
              },
              include: HOTEL_DETAILS_INCLUDE,
            });

            await writeAuditLog(tx, request, {
              actorId: auth.user.id,
              actorType: auth.user.role,
              actorEmail: auth.user.email,
              action: AuditAction.HOTEL_CREATED,
              entityType: 'hotel',
              entityId: hotel.id,
              newValues: { name: hotel.name, slug: hotel.slug, status: hotel.status },
            });
            return hotel;
          });

          return toPartnerHotel(created);
        } catch (error) {
          const duplicateSlug = isUniqueConstraintError(error);
          // An explicit slug is never silently renamed; a generated one may retry.
          if (duplicateSlug && explicitSlug !== undefined) {
            throw new ConflictError('SLUG_ALREADY_EXISTS', 'That slug is already taken');
          }
          if (!duplicateSlug || attempt >= 2) throw error;
          slug = await randomSlugCandidate(baseSlug);
        }
      }
    }
  );

  app.get(
    '/hotels',
    {
      preHandler: authenticate,
      schema: {
        tags: ['Partner'],
        summary: 'List hotels the caller owns or actively manages',
        security: [{ bearerAuth: [] }],
        querystring: apiSchema(partnerHotelQuerySchema),
        response: { 200: apiSchema(partnerHotelListResponseSchema) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const query = partnerHotelQuerySchema.parse(request.query);

      const tenantFilter: Prisma.HotelWhereInput =
        auth.user.role === UserRole.PLATFORM_ADMIN
          ? {}
          : {
              OR: [
                { partnerId: auth.user.id },
                { memberships: { some: { userId: auth.user.id, status: 'active' } } },
              ],
            };

      const where: Prisma.HotelWhereInput = {
        ...tenantFilter,
        ...(query.status ? { status: query.status } : {}),
      };

      const [total, hotels] = await prisma.$transaction([
        prisma.hotel.count({ where }),
        prisma.hotel.findMany({
          where,
          include: HOTEL_DETAILS_INCLUDE,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ]);

      return {
        data: hotels.map(toPartnerHotel),
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
      preHandler: authenticate,
      schema: {
        tags: ['Partner'],
        summary: 'Get a hotel with onboarding documents and lifecycle history',
        security: [{ bearerAuth: [] }],
        params: apiSchema(hotelParamsSchema),
        response: { 200: apiSchema(partnerHotelResponseSchema) },
      },
    },
    async (request) => {
      const { hotelId } = hotelParamsSchema.parse(request.params);
      const access = await requireHotelAccess(request, hotelId);
      requireHotelPermission(access, 'manage_hotel');

      const hotel = await prisma.hotel.findUnique({
        where: { id: hotelId },
        include: HOTEL_DETAILS_INCLUDE,
      });
      if (!hotel) throw new NotFoundError('Hotel');
      return toPartnerHotel(hotel);
    }
  );

  app.patch(
    '/hotels/:hotelId',
    {
      preHandler: authenticate,
      schema: {
        tags: ['Partner'],
        summary: 'Update hotel profile content',
        security: [{ bearerAuth: [] }],
        params: apiSchema(hotelParamsSchema),
        body: apiSchema(hotelUpdateRequestSchema),
        response: { 200: apiSchema(partnerHotelResponseSchema) },
      },
    },
    async (request) => {
      const auth: AuthContext = request.auth!;
      const { hotelId } = hotelParamsSchema.parse(request.params);
      const body = hotelUpdateRequestSchema.parse(request.body);
      const access = await requireHotelAccess(request, hotelId);
      requireHotelPermission(access, 'manage_hotel');
      const hotel = access.hotel;

      assertPartnerEditable(hotel);

      const slugChanging = body.slug !== undefined && body.slug !== hotel.slug;
      if (slugChanging && !SLUG_EDITABLE_STATUSES.includes(hotel.status)) {
        throw new ConflictError(
          'SLUG_IMMUTABLE',
          'The public slug can only change while the hotel is a draft or rejected'
        );
      }

      const data: Prisma.HotelUpdateInput = {};
      if (body.name !== undefined) data.name = body.name;
      if (slugChanging) data.slug = body.slug;
      if (body.description !== undefined) data.description = body.description;
      if (body.propertyType !== undefined) data.propertyType = body.propertyType;
      if (body.checkInTime !== undefined) data.checkInTime = body.checkInTime;
      if (body.checkOutTime !== undefined) data.checkOutTime = body.checkOutTime;
      if (body.amenities !== undefined) data.amenities = body.amenities;
      if (body.houseRules !== undefined) data.houseRules = body.houseRules;
      if (body.accessibilityInfo !== undefined) data.accessibilityInfo = body.accessibilityInfo;
      if (body.address !== undefined) {
        if (body.address.line1 !== undefined) data.addressLine1 = body.address.line1;
        if (body.address.line2 !== undefined) data.addressLine2 = body.address.line2;
        if (body.address.city !== undefined) data.city = body.address.city;
        if (body.address.state !== undefined) data.state = body.address.state;
        if (body.address.country !== undefined) data.country = body.address.country;
        if (body.address.postalCode !== undefined) data.postalCode = body.address.postalCode;
        if (body.address.coordinates !== undefined) {
          data.latitude = body.address.coordinates.latitude;
          data.longitude = body.address.coordinates.longitude;
        }
      }
      if (body.contact !== undefined) {
        if (body.contact.email !== undefined) data.contactEmail = body.contact.email;
        if (body.contact.phone !== undefined) data.contactPhone = body.contact.phone;
        if (body.contact.website !== undefined) data.contactWebsite = body.contact.website;
      }

      const changedFields = Object.keys(data);
      const updated = await prisma.$transaction(async (tx) => {
        let saved;
        try {
          saved = await tx.hotel.update({
            where: { id: hotel.id },
            data,
            include: HOTEL_DETAILS_INCLUDE,
          });
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            throw new ConflictError('SLUG_ALREADY_EXISTS', 'That slug is already taken');
          }
          throw error;
        }

        if (changedFields.length > 0) {
          await writeAuditLog(tx, request, {
            actorId: auth.user.id,
            actorType: auth.user.role,
            actorEmail: auth.user.email,
            action: AuditAction.HOTEL_UPDATED,
            entityType: 'hotel',
            entityId: hotel.id,
            metadata: { changedFields },
          });
        }
        return saved;
      });

      return toPartnerHotel(updated);
    }
  );

  app.post(
    '/hotels/:hotelId/submit',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 60, timeWindow: '1 hour' } },
      schema: {
        tags: ['Partner'],
        summary: 'Submit a draft or rejected hotel for platform review',
        security: [{ bearerAuth: [] }],
        params: apiSchema(hotelParamsSchema),
        body: apiSchema(hotelSubmitRequestSchema),
        response: { 200: apiSchema(partnerHotelResponseSchema) },
      },
    },
    async (request) => {
      const { hotelId } = hotelParamsSchema.parse(request.params);
      const body = hotelSubmitRequestSchema.parse(request.body);
      const access = await requireHotelAccess(request, hotelId);
      requireHotelPermission(access, 'manage_hotel');
      const hotel = access.hotel;

      if (!canSubmitHotel(hotel.status)) {
        throw new ConflictError(
          'HOTEL_NOT_SUBMITTABLE',
          `A hotel in status ${hotel.status} cannot be submitted`
        );
      }

      const saved = await prisma.$transaction(async (tx) => {
        await applyHotelTransition(tx, request, {
          hotel,
          to: 'submitted',
          action: AuditAction.HOTEL_SUBMITTED,
          notes: body.notes ?? null,
          data: {
            submittedAt: new Date(),
            rejectionReason: null,
            submissionNotes: body.notes ?? null,
          },
        });

        await tx.hotelDocument.createMany({
          data: body.documents.map((document) => ({
            hotelId: hotel.id,
            type: document.type,
            url: document.url,
            description: document.description ?? null,
          })),
        });

        return tx.hotel.findUniqueOrThrow({
          where: { id: hotel.id },
          include: HOTEL_DETAILS_INCLUDE,
        });
      });

      return toPartnerHotel(saved);
    }
  );

  app.post(
    '/hotels/:hotelId/media',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 120, timeWindow: '1 hour' } },
      schema: {
        tags: ['Partner'],
        summary: 'Add image metadata to a hotel',
        security: [{ bearerAuth: [] }],
        params: apiSchema(hotelParamsSchema),
        body: apiSchema(hotelMediaCreateRequestSchema),
        response: { 201: apiSchema(hotelMediaResponseSchema) },
      },
    },
    async (request, reply) => {
      const { hotelId } = hotelParamsSchema.parse(request.params);
      const body = hotelMediaCreateRequestSchema.parse(request.body);
      const access = await requireHotelAccess(request, hotelId);
      requireHotelPermission(access, 'manage_hotel');
      assertPartnerEditable(access.hotel);

      const existing = await prisma.hotelMedia.count({ where: { hotelId } });
      if (existing >= 50) {
        throw new ConflictError('MEDIA_LIMIT_REACHED', 'A hotel can store at most 50 images');
      }

      const media = await prisma.hotelMedia.create({
        data: {
          hotelId,
          url: body.url,
          caption: body.caption ?? null,
          altText: body.altText ?? null,
          sortOrder: body.sortOrder,
          mimeType: body.mimeType ?? null,
          width: body.width ?? null,
          height: body.height ?? null,
          sizeBytes: body.sizeBytes ?? null,
        },
      });

      reply.status(201);
      return toHotelMedia(media);
    }
  );

  app.patch(
    '/hotels/:hotelId/media/:mediaId',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 120, timeWindow: '1 hour' } },
      schema: {
        tags: ['Partner'],
        summary: 'Update image metadata for a hotel',
        security: [{ bearerAuth: [] }],
        params: apiSchema(hotelMediaParamsSchema),
        body: apiSchema(hotelMediaUpdateRequestSchema),
        response: { 200: apiSchema(hotelMediaResponseSchema) },
      },
    },
    async (request) => {
      const { hotelId, mediaId } = hotelMediaParamsSchema.parse(request.params);
      const body = hotelMediaUpdateRequestSchema.parse(request.body);
      const access = await requireHotelAccess(request, hotelId);
      requireHotelPermission(access, 'manage_hotel');
      assertPartnerEditable(access.hotel);

      const existing = await prisma.hotelMedia.findFirst({ where: { id: mediaId, hotelId } });
      if (!existing) throw new NotFoundError('Hotel media');

      const media = await prisma.hotelMedia.update({
        where: { id: mediaId },
        data: {
          ...(body.url !== undefined ? { url: body.url } : {}),
          ...(body.caption !== undefined ? { caption: body.caption } : {}),
          ...(body.altText !== undefined ? { altText: body.altText } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
          ...(body.mimeType !== undefined ? { mimeType: body.mimeType } : {}),
          ...(body.width !== undefined ? { width: body.width } : {}),
          ...(body.height !== undefined ? { height: body.height } : {}),
          ...(body.sizeBytes !== undefined ? { sizeBytes: body.sizeBytes } : {}),
        },
      });

      return toHotelMedia(media);
    }
  );

  app.delete(
    '/hotels/:hotelId/media/:mediaId',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 120, timeWindow: '1 hour' } },
      schema: {
        tags: ['Partner'],
        summary: 'Remove image metadata from a hotel',
        security: [{ bearerAuth: [] }],
        params: apiSchema(hotelMediaParamsSchema),
      },
    },
    async (request, reply) => {
      const { hotelId, mediaId } = hotelMediaParamsSchema.parse(request.params);
      const access = await requireHotelAccess(request, hotelId);
      requireHotelPermission(access, 'manage_hotel');
      assertPartnerEditable(access.hotel);

      const existing = await prisma.hotelMedia.findFirst({ where: { id: mediaId, hotelId } });
      if (!existing) throw new NotFoundError('Hotel media');

      await prisma.hotelMedia.delete({ where: { id: mediaId } });
      return reply.status(204).send();
    }
  );
}
