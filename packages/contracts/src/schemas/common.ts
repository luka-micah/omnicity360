// Common Zod schemas reused across API contracts
import { z } from 'zod';

// Primitive schemas (plain strings; domain branding is applied in services, not at the wire boundary)
export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email().max(255);
export const phoneNumberSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/);
export const currencyCodeSchema = z.enum(['NGN', 'USD', 'EUR', 'GBP']);
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const basisPointsSchema = z.number().int().min(0).max(10000);

// Money (integer minor units)
export const moneySchema = z.object({
  amount: z.number().int().min(0),
  currency: currencyCodeSchema,
});

// Pagination
export const paginationParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: z.object({
      page: z.number().int().min(1),
      limit: z.number().int().min(1),
      total: z.number().int().min(0),
      totalPages: z.number().int().min(0),
    }),
  });

// Date range (check-in inclusive, check-out exclusive)
export const dateRangeSchema = z
  .object({
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
  })
  .refine((data) => data.checkIn < data.checkOut, {
    message: 'Check-out must be after check-in',
    path: ['checkOut'],
  });

// Standard API error response
export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

// Idempotency key header/body value
export const idempotencyKeySchema = z.string().min(1).max(128);
export const requestIdHeaderSchema = z.string();

// Sort and filter helpers
export const sortOrderSchema = z.enum(['asc', 'desc']);
export const sortParamsSchema = <T extends string>(fields: readonly [T, ...T[]]) =>
  z.object({
    sortBy: z.enum(fields).optional(),
    sortOrder: sortOrderSchema.optional(),
  });

/** External URL restricted to http(s) so stored links cannot be active script schemes. */
export const httpUrlSchema = z
  .string()
  .url()
  .max(500)
  .refine((value) => /^https?:\/\//i.test(value), {
    message: 'URL must use http or https',
  });

// Address
const addressFields = {
  line1: z.string().min(1).max(255),
  line2: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  country: z.string().length(2),
  postalCode: z.string().max(20).optional(),
  coordinates: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
};

export const addressSchema = z.object(addressFields).extend({
  country: addressFields.country.default('NG'),
});

/**
 * Partial address for PATCH bodies. It deliberately carries no defaults: Fastify's
 * AJV applies `default` keywords before Zod runs, which would otherwise overwrite
 * stored values on a partial update.
 */
export const addressPatchSchema = z.object(addressFields).partial();

// Contact info
export const contactInfoSchema = z.object({
  email: emailSchema.optional(),
  phone: phoneNumberSchema.optional(),
  website: z.string().url().max(255).optional(),
});

// Media metadata
export const mediaSchema = z.object({
  id: uuidSchema,
  url: httpUrlSchema,
  caption: z.string().max(500).optional(),
  altText: z.string().max(255).optional(),
  sortOrder: z.number().int().min(0).default(0),
  mimeType: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sizeBytes: z.number().int().positive().optional(),
});

// Type exports
export type MoneySchema = z.infer<typeof moneySchema>;
export type PaginationParamsSchema = z.infer<typeof paginationParamsSchema>;
export type DateRangeSchema = z.infer<typeof dateRangeSchema>;
export type AddressSchema = z.infer<typeof addressSchema>;
export type ContactInfoSchema = z.infer<typeof contactInfoSchema>;
export type MediaSchema = z.infer<typeof mediaSchema>;
