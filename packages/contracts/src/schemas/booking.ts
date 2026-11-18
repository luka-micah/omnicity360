// Booking, availability, and quote API contracts
import { BookingStatus, InventoryMode } from '@hotel-marketplace/domain';
import { z } from 'zod';

import {
  uuidSchema,
  isoDateSchema,
  isoDateTimeSchema,
  moneySchema,
  paginationParamsSchema,
  paginatedResponseSchema,
  idempotencyKeySchema,
} from './common';

// Availability Search
export const availabilitySearchRequestSchema = z
  .object({
    destination: z.string().min(1).max(100), // city or area
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    adults: z.number().int().min(1).max(20).default(2),
    children: z.number().int().min(0).max(10).default(0),
    rooms: z.number().int().min(1).max(10).default(1),
    priceMin: moneySchema.optional(),
    priceMax: moneySchema.optional(),
    amenities: z.array(z.string().max(100)).optional(),
    propertyTypes: z
      .array(z.enum(['hotel', 'guest_house', 'apartment', 'resort', 'hostel', 'lodge']))
      .optional(),
    sortBy: z.enum(['relevance', 'price_asc', 'price_desc', 'rating']).optional(),
  })
  .merge(paginationParamsSchema)
  .refine((data) => data.checkIn < data.checkOut, {
    message: 'Check-out must be after check-in',
    path: ['checkOut'],
  });

export const availabilityResultSchema = z.object({
  hotelId: uuidSchema,
  hotelName: z.string(),
  hotelSlug: z.string(),
  propertyType: z.string(),
  city: z.string(),
  address: z.object({
    line1: z.string(),
    city: z.string(),
    state: z.string(),
    country: z.string(),
  }),
  images: z.array(
    z.object({
      url: z.string().url(),
      caption: z.string().optional(),
    })
  ),
  minPrice: moneySchema,
  maxPrice: moneySchema,
  currency: z.string(),
  availableRoomCategories: z.array(
    z.object({
      id: uuidSchema,
      name: z.string(),
      slug: z.string(),
      maxAdults: z.number().int(),
      maxChildren: z.number().int(),
      baseRate: moneySchema,
      availableQuantity: z.number().int().min(0),
      inventoryMode: z.nativeEnum(InventoryMode),
      ratePlans: z.array(
        z.object({
          id: uuidSchema,
          name: z.string(),
          type: z.string(),
          price: moneySchema,
        })
      ),
    })
  ),
  description: z.string().nullable(),
  amenities: z.array(z.string()),
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().nullable(),
});

export const availabilitySearchResponseSchema = paginatedResponseSchema(availabilityResultSchema);

// Quote
export const quoteRequestSchema = z
  .object({
    hotelId: uuidSchema,
    roomCategoryId: uuidSchema,
    ratePlanId: uuidSchema.optional(),
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    adults: z.number().int().min(1).max(10),
    children: z.number().int().min(0).max(10),
    rooms: z.number().int().min(1).max(10).default(1),
    promoCode: z.string().max(50).optional(),
  })
  .refine((data) => data.checkIn < data.checkOut, {
    message: 'Check-out must be after check-in',
    path: ['checkOut'],
  });

export const quoteNightlyRateSchema = z.object({
  date: isoDateSchema,
  rate: moneySchema,
  ratePlanId: uuidSchema,
  ratePlanName: z.string(),
});

export const quoteBreakdownSchema = z.object({
  roomCategoryId: uuidSchema,
  roomCategoryName: z.string(),
  ratePlanId: uuidSchema,
  ratePlanName: z.string(),
  ratePlanType: z.string(),
  nights: z.number().int().min(1),
  rooms: z.number().int().min(1),
  nightlyRates: z.array(quoteNightlyRateSchema),
  subtotal: moneySchema,
  discounts: z
    .array(
      z.object({
        name: z.string(),
        amount: moneySchema,
        fundedBy: z.enum(['hotel', 'platform']),
      })
    )
    .default([]),
  taxes: z
    .array(
      z.object({
        name: z.string(),
        amount: moneySchema,
        rateBps: z.number().int().min(0).max(10000),
      })
    )
    .default([]),
  mandatoryFees: z
    .array(
      z.object({
        name: z.string(),
        amount: moneySchema,
      })
    )
    .default([]),
  optionalExtras: z
    .array(
      z.object({
        id: uuidSchema,
        name: z.string(),
        amount: moneySchema,
        selected: z.boolean(),
      })
    )
    .default([]),
  total: moneySchema,
  cancellationPolicy: z.object({
    id: uuidSchema,
    name: z.string(),
    description: z.string(),
    freeCancellationUntil: isoDateTimeSchema.nullable(),
    refundPercent: z.number().int().min(0).max(100).nullable(),
  }),
  commissionBps: z.number().int().min(0).max(10000),
  quoteId: uuidSchema,
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});

export const quoteResponseSchema = quoteBreakdownSchema;

// Booking
export const bookingGuestSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  specialRequests: z.string().max(2000).optional(),
  isPrimary: z.boolean().default(false),
});

export const bookingRoomSchema = z.object({
  roomCategoryId: uuidSchema,
  ratePlanId: uuidSchema,
  adults: z.number().int().min(1).max(10),
  children: z.number().int().min(0).max(10),
  quantity: z.number().int().min(1).max(10).default(1),
});

export const bookingCreateRequestSchema = z
  .object({
    quoteId: uuidSchema,
    idempotencyKey: idempotencyKeySchema,
    guests: z.array(bookingGuestSchema).min(1).max(10),
    rooms: z.array(bookingRoomSchema).min(1).max(10),
    specialRequests: z.string().max(2000).optional(),
  })
  .strict();

export const bookingNightSnapshotSchema = z.object({
  date: isoDateSchema,
  rate: moneySchema,
  ratePlanId: uuidSchema,
  ratePlanName: z.string(),
});

export const bookingRoomSnapshotSchema = z.object({
  roomCategoryId: uuidSchema,
  roomCategoryName: z.string(),
  ratePlanId: uuidSchema,
  ratePlanName: z.string(),
  ratePlanType: z.string(),
  adults: z.number().int(),
  children: z.number().int(),
  quantity: z.number().int(),
  nights: z.array(bookingNightSnapshotSchema),
  subtotal: moneySchema,
  taxes: z.array(
    z.object({
      name: z.string(),
      amount: moneySchema,
      rateBps: z.number().int(),
    })
  ),
  mandatoryFees: z.array(
    z.object({
      name: z.string(),
      amount: moneySchema,
    })
  ),
  total: moneySchema,
});

export const bookingPolicySnapshotSchema = z.object({
  cancellationPolicyId: uuidSchema,
  policyName: z.string(),
  policyDescription: z.string(),
  freeCancellationUntil: isoDateTimeSchema.nullable(),
  refundPercent: z.number().int().min(0).max(100).nullable(),
  termsHtml: z.string(),
});

export const bookingCommissionSnapshotSchema = z.object({
  agreementId: uuidSchema.nullable(),
  commissionBps: z.number().int().min(0).max(10000),
  calculationBasis: z.enum([
    'room_revenue',
    'room_revenue_plus_mandatory_fees',
    'total_before_taxes',
  ]),
  discountFundedBy: z.enum(['hotel', 'platform', 'shared']),
  amount: moneySchema,
});

export const bookingResponseSchema = z.object({
  id: uuidSchema,
  reference: z.string(), // public booking reference (opaque)
  accessToken: z.string(), // secure access token for guest access
  status: z.nativeEnum(BookingStatus),
  hotelId: uuidSchema,
  hotelName: z.string(),
  hotelSlug: z.string(),
  customerId: uuidSchema.nullable(), // null for guest bookings
  guestEmail: z.string().email(),
  guestPhone: z.string(),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  nights: z.number().int(),
  adults: z.number().int(),
  children: z.number().int(),
  rooms: z.number().int(),
  roomsSnapshot: z.array(bookingRoomSnapshotSchema),
  policySnapshot: bookingPolicySnapshotSchema,
  commissionSnapshot: bookingCommissionSnapshotSchema,
  pricingSnapshot: z.object({
    subtotal: moneySchema,
    discounts: z.array(
      z.object({
        name: z.string(),
        amount: moneySchema,
        fundedBy: z.enum(['hotel', 'platform']),
      })
    ),
    taxes: z.array(
      z.object({
        name: z.string(),
        amount: moneySchema,
        rateBps: z.number().int(),
      })
    ),
    mandatoryFees: z.array(
      z.object({
        name: z.string(),
        amount: moneySchema,
      })
    ),
    optionalExtras: z.array(
      z.object({
        id: uuidSchema,
        name: z.string(),
        amount: moneySchema,
      })
    ),
    total: moneySchema,
    currency: z.string(),
  }),
  paymentId: uuidSchema.nullable(),
  holdExpiresAt: isoDateTimeSchema.nullable(),
  confirmedAt: isoDateTimeSchema.nullable(),
  checkedInAt: isoDateTimeSchema.nullable(),
  checkedOutAt: isoDateTimeSchema.nullable(),
  cancelledAt: isoDateTimeSchema.nullable(),
  cancellationReason: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const bookingListResponseSchema = paginatedResponseSchema(bookingResponseSchema);

export const bookingCancellationRequestSchema = z.object({
  reason: z.string().min(1).max(1000),
  requestedBy: z.enum(['customer', 'hotel', 'admin']),
});

export const cancellationRequestResponseSchema = z.object({
  id: uuidSchema,
  bookingId: uuidSchema,
  requestedBy: z.enum(['customer', 'hotel', 'admin']),
  reason: z.string(),
  status: z.enum(['pending', 'approved', 'rejected', 'auto_approved', 'auto_rejected']),
  refundAmount: moneySchema.nullable(),
  decidedBy: uuidSchema.nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

// Booking status history
export const bookingStatusHistorySchema = z.object({
  id: uuidSchema,
  bookingId: uuidSchema,
  fromStatus: z.nativeEnum(BookingStatus).nullable(),
  toStatus: z.nativeEnum(BookingStatus),
  actorId: uuidSchema.nullable(),
  actorType: z.enum(['customer', 'hotel_staff', 'admin', 'system']),
  reason: z.string().nullable(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: isoDateTimeSchema,
});

// Type exports
export type AvailabilitySearchRequest = z.infer<typeof availabilitySearchRequestSchema>;
export type AvailabilityResult = z.infer<typeof availabilityResultSchema>;
export type AvailabilitySearchResponse = z.infer<typeof availabilitySearchResponseSchema>;

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export type QuoteNightlyRate = z.infer<typeof quoteNightlyRateSchema>;
export type QuoteBreakdown = z.infer<typeof quoteBreakdownSchema>;
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;

export type BookingGuest = z.infer<typeof bookingGuestSchema>;
export type BookingRoom = z.infer<typeof bookingRoomSchema>;
export type BookingCreateRequest = z.infer<typeof bookingCreateRequestSchema>;
export type BookingNightSnapshot = z.infer<typeof bookingNightSnapshotSchema>;
export type BookingRoomSnapshot = z.infer<typeof bookingRoomSnapshotSchema>;
export type BookingPolicySnapshot = z.infer<typeof bookingPolicySnapshotSchema>;
export type BookingCommissionSnapshot = z.infer<typeof bookingCommissionSnapshotSchema>;
export type BookingResponse = z.infer<typeof bookingResponseSchema>;
export type BookingListResponse = z.infer<typeof bookingListResponseSchema>;
export type BookingCancellationRequest = z.infer<typeof bookingCancellationRequestSchema>;
export type CancellationRequestResponse = z.infer<typeof cancellationRequestResponseSchema>;
export type BookingStatusHistory = z.infer<typeof bookingStatusHistorySchema>;
