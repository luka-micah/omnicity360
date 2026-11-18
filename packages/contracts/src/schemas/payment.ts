// Payment and webhook API contracts
import { PaymentStatus } from '@hotel-marketplace/domain';
import { z } from 'zod';

import {
  uuidSchema,
  isoDateTimeSchema,
  moneySchema,
  paginatedResponseSchema,
  idempotencyKeySchema,
} from './common';

// Payment initialization
export const paymentInitializeRequestSchema = z.object({
  bookingId: uuidSchema,
  amount: moneySchema,
  currency: z.string().length(3),
  customerEmail: z.string().email(),
  customerPhone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  customerName: z.string().min(1).max(255),
  redirectUrl: z.string().url(),
  webhookUrl: z.string().url().optional(),
  metadata: z.record(z.string()).optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const paymentInitializeResponseSchema = z.object({
  paymentId: uuidSchema,
  providerReference: z.string(),
  checkoutUrl: z.string().url(),
  expiresAt: isoDateTimeSchema,
  status: z.nativeEnum(PaymentStatus),
});

export const paymentStatusResponseSchema = z.object({
  id: uuidSchema,
  bookingId: uuidSchema,
  provider: z.string(),
  providerReference: z.string(),
  amount: moneySchema,
  currency: z.string(),
  status: z.nativeEnum(PaymentStatus),
  initializedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
  failedAt: isoDateTimeSchema.nullable(),
  failureReason: z.string().nullable(),
  metadata: z.record(z.string()).optional(),
});

export const paymentListResponseSchema = paginatedResponseSchema(paymentStatusResponseSchema);

// Refund
export const refundRequestSchema = z.object({
  paymentId: uuidSchema,
  amount: moneySchema.optional(), // partial refund if specified
  reason: z.string().min(1).max(1000),
  idempotencyKey: idempotencyKeySchema,
  initiatedBy: z.enum(['customer', 'hotel', 'admin']),
});

export const refundResponseSchema = z.object({
  id: uuidSchema,
  paymentId: uuidSchema,
  amount: moneySchema,
  reason: z.string(),
  status: z.enum(['pending', 'processing', 'succeeded', 'failed', 'cancelled']),
  providerRefundId: z.string().nullable(),
  initiatedBy: z.enum(['customer', 'hotel', 'admin']),
  processedBy: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});

export const refundListResponseSchema = paginatedResponseSchema(refundResponseSchema);

// Webhook events (normalized)
export const webhookEventSchema = z.object({
  id: uuidSchema,
  provider: z.string(),
  providerEventId: z.string(),
  eventType: z.string(),
  payload: z.record(z.unknown()),
  receivedAt: isoDateTimeSchema,
  processedAt: isoDateTimeSchema.nullable(),
  processingError: z.string().nullable(),
  retryCount: z.number().int().default(0),
});

export const webhookEventListResponseSchema = paginatedResponseSchema(webhookEventSchema);

// Provider-specific webhook validation (to be extended per provider)
// These are base schemas; each provider adapter defines its own validation

export const flutterwaveWebhookSchema = z.object({
  event: z.string(),
  data: z.object({
    id: z.number(),
    tx_ref: z.string(),
    flw_ref: z.string(),
    amount: z.number(),
    currency: z.string(),
    status: z.string(),
    customer: z.object({
      email: z.string().email(),
      name: z.string(),
      phone_number: z.string().optional(),
    }),
    meta: z.record(z.unknown()).optional(),
  }),
});

export const paystackWebhookSchema = z.object({
  event: z.string(),
  data: z.object({
    id: z.number(),
    reference: z.string(),
    amount: z.number(),
    currency: z.string(),
    status: z.string(),
    customer: z.object({
      email: z.string().email(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      phone: z.string().optional(),
    }),
    metadata: z.record(z.unknown()).optional(),
  }),
});

export const monnifyWebhookSchema = z.object({
  eventType: z.string(),
  eventData: z.object({
    transactionReference: z.string(),
    amount: z.number(),
    currency: z.string(),
    paymentStatus: z.string(),
    customerName: z.string(),
    customerEmail: z.string().email(),
    paymentMethod: z.string(),
    settlementAmount: z.number().optional(),
  }),
});

// Normalized payment event (internal representation)
export const normalizedPaymentEventSchema = z.object({
  provider: z.string(),
  providerEventId: z.string(),
  eventType: z.enum([
    'payment_succeeded',
    'payment_failed',
    'payment_pending',
    'refund_succeeded',
    'refund_failed',
    'chargeback',
  ]),
  paymentId: uuidSchema.nullable(), // matched if possible
  providerReference: z.string(),
  amount: moneySchema,
  currency: z.string(),
  status: z.nativeEnum(PaymentStatus),
  customerEmail: z.string().email(),
  customerName: z.string(),
  metadata: z.record(z.unknown()).optional(),
  rawPayload: z.record(z.unknown()),
  receivedAt: isoDateTimeSchema,
});

// Type exports
export type PaymentInitializeRequest = z.infer<typeof paymentInitializeRequestSchema>;
export type PaymentInitializeResponse = z.infer<typeof paymentInitializeResponseSchema>;
export type PaymentStatusResponse = z.infer<typeof paymentStatusResponseSchema>;
export type PaymentListResponse = z.infer<typeof paymentListResponseSchema>;

export type RefundRequest = z.infer<typeof refundRequestSchema>;
export type RefundResponse = z.infer<typeof refundResponseSchema>;
export type RefundListResponse = z.infer<typeof refundListResponseSchema>;

export type WebhookEvent = z.infer<typeof webhookEventSchema>;
export type WebhookEventListResponse = z.infer<typeof webhookEventListResponseSchema>;

export type NormalizedPaymentEvent = z.infer<typeof normalizedPaymentEventSchema>;
