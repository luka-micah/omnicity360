// Hotel and room category API contracts
import { HotelStatus, InventoryMode, RatePlanType } from '@hotel-marketplace/domain';
import { z } from 'zod';

import {
  uuidSchema,
  isoDateSchema,
  moneySchema,
  paginatedResponseSchema,
  addressSchema,
  addressPatchSchema,
  contactInfoSchema,
  mediaSchema,
  basisPointsSchema,
  httpUrlSchema,
  paginationParamsSchema,
} from './common';

// ============================================
// Rate plans (defined before categories that embed them)
// ============================================

export const ratePlanCreateRequestSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.nativeEnum(RatePlanType),
  description: z.string().max(1000).optional(),
  baseRate: moneySchema,
  cancellationPolicyId: uuidSchema.optional(),
  minStayNights: z.number().int().min(1).default(1),
  maxStayNights: z.number().int().min(1).max(365).optional(),
  closedToArrival: z.array(isoDateSchema).default([]),
  closedToDeparture: z.array(isoDateSchema).default([]),
  advancePurchaseDays: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
});

export const ratePlanUpdateRequestSchema = ratePlanCreateRequestSchema.partial();

export const ratePlanResponseSchema = z.object({
  id: uuidSchema,
  roomCategoryId: uuidSchema,
  name: z.string(),
  type: z.nativeEnum(RatePlanType),
  description: z.string().nullable(),
  baseRate: moneySchema,
  cancellationPolicyId: uuidSchema.nullable(),
  minStayNights: z.number().int(),
  maxStayNights: z.number().int().nullable(),
  closedToArrival: z.array(isoDateSchema),
  closedToDeparture: z.array(isoDateSchema),
  advancePurchaseDays: z.number().int().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ============================================
// Hotel
// ============================================

const hotelTimeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/);

/** Shared profile fields. Kept default-free so PATCH bodies never inherit defaults. */
const hotelProfileFields = {
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must be lowercase letters, numbers, and single hyphens'
    )
    .optional(),
  description: z.string().max(5000).optional(),
  propertyType: z.enum(['hotel', 'guest_house', 'apartment', 'resort', 'hostel', 'lodge']),
  checkInTime: hotelTimeSchema,
  checkOutTime: hotelTimeSchema,
  amenities: z.array(z.string().max(100)),
  houseRules: z.string().max(5000).optional(),
  accessibilityInfo: z.string().max(5000).optional(),
};

export const hotelCreateRequestSchema = z
  .object({
    ...hotelProfileFields,
    address: addressSchema,
    contact: contactInfoSchema,
  })
  .extend({
    checkInTime: hotelTimeSchema.default('14:00'),
    checkOutTime: hotelTimeSchema.default('11:00'),
    amenities: z.array(z.string().max(100)).default([]),
    // Commission is platform-controlled; partners cannot set it here.
  });

export const hotelUpdateRequestSchema = z.object(hotelProfileFields).partial().extend({
  // Nested objects are partial so a PATCH never resets untouched address/contact fields.
  address: addressPatchSchema.optional(),
  contact: contactInfoSchema.optional(),
});

export const hotelSubmitRequestSchema = z.object({
  documents: z
    .array(
      z.object({
        type: z.enum([
          'cac_certificate',
          'tax_clearance',
          'fire_safety',
          'business_permit',
          'other',
        ]),
        url: httpUrlSchema,
        description: z.string().max(500).optional(),
      })
    )
    .min(1)
    .max(10),
  notes: z.string().max(2000).optional(),
});

export const hotelReviewRequestSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const hotelApproveRequestSchema = z.object({
  commissionBps: basisPointsSchema.optional(),
  notes: z.string().max(2000).optional(),
});

export const hotelRejectRequestSchema = z.object({
  rejectionReason: z.string().min(1).max(1000),
  notes: z.string().max(2000).optional(),
});

export const hotelReinstateRequestSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const hotelSuspendRequestSchema = z.object({
  reason: z.string().min(1).max(1000),
  notifyPartner: z.boolean().default(true),
});

// ============================================
// Media metadata (Phase 3)
// ============================================

/** Shared media fields, default-free so PATCH bodies never inherit defaults. */
const hotelMediaFields = {
  url: httpUrlSchema,
  caption: z.string().max(500).optional(),
  altText: z.string().max(255).optional(),
  sortOrder: z.number().int().min(0).max(10_000),
  mimeType: z.string().max(100).optional(),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
  sizeBytes: z.number().int().min(1).optional(),
};

export const hotelMediaCreateRequestSchema = z.object(hotelMediaFields).extend({
  sortOrder: hotelMediaFields.sortOrder.default(0),
});

export const hotelMediaUpdateRequestSchema = z
  .object(hotelMediaFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one media field is required',
  });

export const hotelMediaParamsSchema = z.object({
  hotelId: uuidSchema,
  mediaId: uuidSchema,
});

export const hotelMediaResponseSchema = mediaSchema;

// ============================================
// Lifecycle records (Phase 3)
// ============================================

export const hotelDocumentSchema = z.object({
  id: uuidSchema,
  hotelId: uuidSchema,
  type: z.enum(['cac_certificate', 'tax_clearance', 'fire_safety', 'business_permit', 'other']),
  url: httpUrlSchema,
  description: z.string().nullable(),
  verified: z.boolean(),
  verifiedBy: uuidSchema.nullable(),
  verifiedAt: z.string().datetime().nullable(),
  uploadedAt: z.string().datetime(),
});

export const hotelStatusHistoryEntrySchema = z.object({
  id: uuidSchema,
  hotelId: uuidSchema,
  fromStatus: z.nativeEnum(HotelStatus).nullable(),
  toStatus: z.nativeEnum(HotelStatus),
  actorId: uuidSchema.nullable(),
  actorType: z.string(),
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const hotelPartnerSummarySchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
});

export const partnerHotelQuerySchema = paginationParamsSchema.extend({
  status: z.nativeEnum(HotelStatus).optional(),
});

// ============================================
// Room categories
// ============================================

export const roomCategoryCreateRequestSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().max(5000).optional(),
  maxAdults: z.number().int().min(1).max(10).default(2),
  maxChildren: z.number().int().min(0).max(10).default(2),
  bedConfiguration: z.string().max(100).optional(),
  roomSizeSqm: z.number().positive().optional(),
  amenities: z.array(z.string().max(100)).default([]),
  smokingAllowed: z.boolean().default(false),
  accessible: z.boolean().default(false),
  inventoryMode: z.nativeEnum(InventoryMode).default(InventoryMode.CATEGORY_QUANTITY),
  totalQuantity: z.number().int().min(1).optional(),
  baseRate: moneySchema,
  ratePlans: z.array(ratePlanCreateRequestSchema).default([]),
});

export const roomCategoryUpdateRequestSchema = roomCategoryCreateRequestSchema.partial();

export const roomCategoryResponseSchema = z.object({
  id: uuidSchema,
  hotelId: uuidSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  maxAdults: z.number().int(),
  maxChildren: z.number().int(),
  bedConfiguration: z.string().nullable(),
  roomSizeSqm: z.number().nullable(),
  amenities: z.array(z.string()),
  smokingAllowed: z.boolean(),
  accessible: z.boolean(),
  inventoryMode: z.nativeEnum(InventoryMode),
  totalQuantity: z.number().int().nullable(),
  baseRate: moneySchema,
  ratePlans: z.array(ratePlanResponseSchema),
  images: z.array(mediaSchema),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const hotelResponseSchema = z.object({
  id: uuidSchema,
  partnerId: uuidSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  propertyType: z.string(),
  address: addressSchema,
  contact: contactInfoSchema,
  checkInTime: z.string(),
  checkOutTime: z.string(),
  amenities: z.array(z.string()),
  houseRules: z.string().nullable(),
  accessibilityInfo: z.string().nullable(),
  images: z.array(mediaSchema),
  status: z.nativeEnum(HotelStatus),
  rejectionReason: z.string().nullable(),
  defaultCommissionBps: basisPointsSchema.nullable(),
  submittedAt: z.string().datetime().nullable(),
  approvedAt: z.string().datetime().nullable(),
  approvedBy: uuidSchema.nullable(),
  suspendedAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const hotelListResponseSchema = paginatedResponseSchema(hotelResponseSchema);

/** Partner-facing hotel detail including onboarding documents and lifecycle history. */
export const partnerHotelResponseSchema = hotelResponseSchema.extend({
  submissionNotes: z.string().nullable(),
  documents: z.array(hotelDocumentSchema),
  statusHistory: z.array(hotelStatusHistoryEntrySchema),
});

export const partnerHotelListResponseSchema = paginatedResponseSchema(partnerHotelResponseSchema);

/** Admin-facing hotel detail including internal notes and partner identity. */
export const adminHotelResponseSchema = partnerHotelResponseSchema.extend({
  internalNotes: z.string().nullable(),
  partner: hotelPartnerSummarySchema,
});

/** Admin list rows omit per-hotel history and document payloads for list performance. */
export const adminHotelListItemSchema = hotelResponseSchema.extend({
  internalNotes: z.string().nullable(),
  partner: hotelPartnerSummarySchema,
  documentCount: z.number().int().min(0),
});

export const adminHotelListResponseSchema = paginatedResponseSchema(adminHotelListItemSchema);

// ============================================
// Commission agreement (referenced by hotel detail)
// ============================================

export const commissionAgreementCreateRequestSchema = z.object({
  hotelId: uuidSchema,
  commissionBps: basisPointsSchema,
  effectiveFrom: isoDateSchema,
  effectiveTo: isoDateSchema.optional(),
  terms: z.string().max(5000).optional(),
  signedDocumentUrl: z.string().url().optional(),
});

export const commissionAgreementResponseSchema = z.object({
  id: uuidSchema,
  hotelId: uuidSchema,
  commissionBps: basisPointsSchema,
  effectiveFrom: isoDateSchema,
  effectiveTo: isoDateSchema.nullable(),
  terms: z.string().nullable(),
  signedDocumentUrl: z.string().nullable(),
  status: z.enum(['draft', 'active', 'superseded', 'terminated']),
  createdBy: uuidSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const hotelDetailResponseSchema = hotelResponseSchema.extend({
  roomCategories: z.array(roomCategoryResponseSchema),
  commissionAgreement: commissionAgreementResponseSchema.nullable(),
});

// ============================================
// Physical rooms
// ============================================

export const physicalRoomCreateRequestSchema = z.object({
  roomNumber: z.string().min(1).max(50),
  roomCategoryId: uuidSchema,
  floor: z.number().int().min(0).optional(),
  description: z.string().max(1000).optional(),
});

export const physicalRoomUpdateRequestSchema = z.object({
  roomNumber: z.string().min(1).max(50).optional(),
  floor: z.number().int().min(0).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(['available', 'maintenance', 'out_of_service']).optional(),
});

export const physicalRoomResponseSchema = z.object({
  id: uuidSchema,
  hotelId: uuidSchema,
  roomCategoryId: uuidSchema,
  roomNumber: z.string(),
  floor: z.number().int().nullable(),
  description: z.string().nullable(),
  status: z.enum(['available', 'maintenance', 'out_of_service']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ============================================
// Inventory and rates
// ============================================

export const inventoryDayRequestSchema = z.object({
  date: isoDateSchema,
  quantity: z.number().int().min(0),
  stopSell: z.boolean().default(false),
  minStay: z.number().int().min(1).optional(),
  maxStay: z.number().int().min(1).optional(),
  closedToArrival: z.boolean().default(false),
  closedToDeparture: z.boolean().default(false),
});

export const inventoryBulkRequestSchema = z.object({
  roomCategoryId: uuidSchema,
  inventory: z.array(inventoryDayRequestSchema).min(1).max(366),
});

export const rateBulkRequestSchema = z.object({
  roomCategoryId: uuidSchema,
  ratePlanId: uuidSchema.optional(),
  rates: z
    .array(
      z.object({
        date: isoDateSchema,
        price: moneySchema,
        minStay: z.number().int().min(1).optional(),
        maxStay: z.number().int().min(1).optional(),
        closedToArrival: z.boolean().default(false),
        closedToDeparture: z.boolean().default(false),
        stopSell: z.boolean().default(false),
      })
    )
    .min(1)
    .max(366),
});

// ============================================
// Maintenance blocks
// ============================================

export const maintenanceBlockCreateRequestSchema = z.object({
  roomCategoryId: uuidSchema.optional(),
  physicalRoomId: uuidSchema.optional(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  reason: z.string().min(1).max(500),
});

export const maintenanceBlockResponseSchema = z.object({
  id: uuidSchema,
  hotelId: uuidSchema,
  roomCategoryId: uuidSchema.nullable(),
  physicalRoomId: uuidSchema.nullable(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  reason: z.string(),
  createdAt: z.string().datetime(),
});

// ============================================
// Cancellation policies
// ============================================

export const cancellationPolicyCreateRequestSchema = z
  .object({
    name: z.string().min(1).max(100),
    template: z.enum(['flexible', 'moderate', 'strict', 'non_refundable', 'custom']),
    description: z.string().max(2000),
    freeCancellationUntilHoursBeforeCheckIn: z.number().int().min(0).optional(),
    refundPercentBeforeDays: z.number().int().min(0).max(100).optional(),
    refundPercentAfterDays: z.number().int().min(0).max(100).optional(),
    customRules: z
      .array(
        z.object({
          daysBeforeCheckIn: z.number().int().min(0),
          refundPercent: z.number().int().min(0).max(100),
        })
      )
      .optional(),
  })
  .refine(
    (data) => {
      if (data.template === 'custom') {
        return data.customRules !== undefined && data.customRules.length > 0;
      }
      return true;
    },
    { message: 'Custom rules required for custom template', path: ['customRules'] }
  );

export const cancellationPolicyResponseSchema = z.object({
  id: uuidSchema,
  hotelId: uuidSchema.nullable(),
  name: z.string(),
  template: z.string(),
  description: z.string(),
  freeCancellationUntilHoursBeforeCheckIn: z.number().int().nullable(),
  refundPercentBeforeDays: z.number().int().nullable(),
  refundPercentAfterDays: z.number().int().nullable(),
  customRules: z
    .array(
      z.object({
        daysBeforeCheckIn: z.number().int(),
        refundPercent: z.number().int(),
      })
    )
    .nullable(),
  isPlatformTemplate: z.boolean(),
  createdAt: z.string().datetime(),
});

// Type exports
export type HotelCreateRequest = z.infer<typeof hotelCreateRequestSchema>;
export type HotelUpdateRequest = z.infer<typeof hotelUpdateRequestSchema>;
export type HotelSubmitRequest = z.infer<typeof hotelSubmitRequestSchema>;
export type HotelReviewRequest = z.infer<typeof hotelReviewRequestSchema>;
export type HotelApproveRequest = z.infer<typeof hotelApproveRequestSchema>;
export type HotelRejectRequest = z.infer<typeof hotelRejectRequestSchema>;
export type HotelReinstateRequest = z.infer<typeof hotelReinstateRequestSchema>;
export type HotelSuspendRequest = z.infer<typeof hotelSuspendRequestSchema>;
export type HotelMediaCreateRequest = z.infer<typeof hotelMediaCreateRequestSchema>;
export type HotelMediaUpdateRequest = z.infer<typeof hotelMediaUpdateRequestSchema>;
export type HotelMediaResponse = z.infer<typeof hotelMediaResponseSchema>;
export type HotelDocument = z.infer<typeof hotelDocumentSchema>;
export type HotelStatusHistoryEntry = z.infer<typeof hotelStatusHistoryEntrySchema>;
export type HotelResponse = z.infer<typeof hotelResponseSchema>;
export type HotelListResponse = z.infer<typeof hotelListResponseSchema>;
export type HotelDetailResponse = z.infer<typeof hotelDetailResponseSchema>;
export type PartnerHotelResponse = z.infer<typeof partnerHotelResponseSchema>;
export type PartnerHotelListResponse = z.infer<typeof partnerHotelListResponseSchema>;
export type AdminHotelResponse = z.infer<typeof adminHotelResponseSchema>;
export type AdminHotelListItem = z.infer<typeof adminHotelListItemSchema>;
export type AdminHotelListResponse = z.infer<typeof adminHotelListResponseSchema>;
export type PartnerHotelQuery = z.infer<typeof partnerHotelQuerySchema>;

export type RoomCategoryCreateRequest = z.infer<typeof roomCategoryCreateRequestSchema>;
export type RoomCategoryUpdateRequest = z.infer<typeof roomCategoryUpdateRequestSchema>;
export type RoomCategoryResponse = z.infer<typeof roomCategoryResponseSchema>;

export type RatePlanCreateRequest = z.infer<typeof ratePlanCreateRequestSchema>;
export type RatePlanUpdateRequest = z.infer<typeof ratePlanUpdateRequestSchema>;
export type RatePlanResponse = z.infer<typeof ratePlanResponseSchema>;

export type PhysicalRoomCreateRequest = z.infer<typeof physicalRoomCreateRequestSchema>;
export type PhysicalRoomUpdateRequest = z.infer<typeof physicalRoomUpdateRequestSchema>;
export type PhysicalRoomResponse = z.infer<typeof physicalRoomResponseSchema>;

export type InventoryDayRequest = z.infer<typeof inventoryDayRequestSchema>;
export type InventoryBulkRequest = z.infer<typeof inventoryBulkRequestSchema>;
export type RateBulkRequest = z.infer<typeof rateBulkRequestSchema>;

export type MaintenanceBlockCreateRequest = z.infer<typeof maintenanceBlockCreateRequestSchema>;
export type MaintenanceBlockResponse = z.infer<typeof maintenanceBlockResponseSchema>;

export type CancellationPolicyCreateRequest = z.infer<typeof cancellationPolicyCreateRequestSchema>;
export type CancellationPolicyResponse = z.infer<typeof cancellationPolicyResponseSchema>;

export type CommissionAgreementCreateRequest = z.infer<
  typeof commissionAgreementCreateRequestSchema
>;
export type CommissionAgreementResponse = z.infer<typeof commissionAgreementResponseSchema>;
