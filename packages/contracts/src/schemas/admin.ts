// Admin, finance, and ledger API contracts
import {
  HotelStatus,
  PayoutStatus,
  LedgerEntryType,
  LedgerAccountType,
} from '@hotel-marketplace/domain';
import { z } from 'zod';

import {
  uuidSchema,
  isoDateSchema,
  isoDateTimeSchema,
  moneySchema,
  paginationParamsSchema,
  paginatedResponseSchema,
  basisPointsSchema,
} from './common';
import { adminHotelResponseSchema } from './hotel';

// Admin Hotel Management
export const adminHotelListParamsSchema = paginationParamsSchema.extend({
  status: z.nativeEnum(HotelStatus).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  partnerId: uuidSchema.optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['createdAt', 'name', 'city', 'status']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// Phase 3: hotel detail shares the partner-facing shape plus internal notes and
// partner identity. Finance summaries arrive with Phase 8.
export const adminHotelDetailResponseSchema = adminHotelResponseSchema;

export const adminBookingListParamsSchema = paginationParamsSchema.extend({
  status: z.array(z.string()).optional(),
  hotelId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
  paymentStatus: z.array(z.string()).optional(),
  search: z.string().max(255).optional(),
});

export const adminBookingDetailResponseSchema = z.object({
  // extends bookingResponseSchema with admin fields
  internalNotes: z.string().nullable(),
  payment: z
    .object({
      id: uuidSchema,
      provider: z.string(),
      providerReference: z.string(),
      amount: moneySchema,
      status: z.string(),
      fee: moneySchema.nullable(),
      netAmount: moneySchema.nullable(),
      createdAt: isoDateTimeSchema,
      completedAt: isoDateTimeSchema.nullable(),
    })
    .nullable(),
  refunds: z.array(
    z.object({
      id: uuidSchema,
      amount: moneySchema,
      status: z.string(),
      reason: z.string(),
      createdAt: isoDateTimeSchema,
    })
  ),
  commission: z
    .object({
      agreementId: uuidSchema,
      commissionBps: basisPointsSchema,
      amount: moneySchema,
      calculatedAt: isoDateTimeSchema,
    })
    .nullable(),
  payouts: z.array(
    z.object({
      id: uuidSchema,
      batchId: uuidSchema,
      amount: moneySchema,
      status: z.string(),
      paidAt: isoDateTimeSchema.nullable(),
    })
  ),
});

// Commission Agreement Admin
export const adminCommissionAgreementCreateSchema = z.object({
  hotelId: uuidSchema,
  commissionBps: basisPointsSchema,
  effectiveFrom: isoDateSchema,
  effectiveTo: isoDateSchema.optional(),
  terms: z.string().max(5000).optional(),
  signedDocumentUrl: z.string().url().optional(),
});

export const adminCommissionAgreementUpdateSchema = z.object({
  commissionBps: basisPointsSchema.optional(),
  effectiveTo: isoDateSchema.optional(),
  terms: z.string().max(5000).optional(),
  signedDocumentUrl: z.string().url().optional(),
  status: z.enum(['draft', 'active', 'superseded', 'terminated']).optional(),
});

export const adminCommissionAgreementResponseSchema = z.object({
  id: uuidSchema,
  hotelId: uuidSchema,
  hotelName: z.string(),
  commissionBps: basisPointsSchema,
  effectiveFrom: isoDateSchema,
  effectiveTo: isoDateSchema.nullable(),
  terms: z.string().nullable(),
  signedDocumentUrl: z.string().nullable(),
  status: z.enum(['draft', 'active', 'superseded', 'terminated']),
  createdBy: uuidSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const adminCommissionAgreementListResponseSchema = paginatedResponseSchema(
  adminCommissionAgreementResponseSchema
);

// Finance Ledger
export const ledgerEntrySchema = z.object({
  id: uuidSchema,
  transactionId: uuidSchema,
  accountType: z.nativeEnum(LedgerAccountType),
  accountId: uuidSchema, // hotelId, userId, or platform
  entryType: z.nativeEnum(LedgerEntryType),
  amount: moneySchema,
  balanceAfter: moneySchema,
  description: z.string(),
  reference: z.string().nullable(), // bookingId, paymentId, payoutId, etc.
  referenceType: z
    .enum(['booking', 'payment', 'refund', 'payout', 'commission', 'adjustment', 'manual'])
    .nullable(),
  createdBy: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export const ledgerTransactionSchema = z.object({
  id: uuidSchema,
  description: z.string(),
  reference: z.string().nullable(),
  referenceType: z
    .enum(['booking', 'payment', 'refund', 'payout', 'commission', 'adjustment', 'manual'])
    .nullable(),
  entries: z.array(ledgerEntrySchema).min(2), // double-entry: at least 2 entries
  isBalanced: z.boolean(),
  createdBy: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export const ledgerListParamsSchema = paginationParamsSchema.extend({
  accountType: z.nativeEnum(LedgerAccountType).optional(),
  accountId: uuidSchema.optional(),
  entryType: z.nativeEnum(LedgerEntryType).optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
  reference: uuidSchema.optional(),
  referenceType: z.string().optional(),
});

export const ledgerListResponseSchema = paginatedResponseSchema(ledgerEntrySchema);

export const ledgerTransactionListResponseSchema = paginatedResponseSchema(ledgerTransactionSchema);

// Hotel Statement
export const hotelStatementParamsSchema = z.object({
  hotelId: uuidSchema,
  dateFrom: isoDateSchema,
  dateTo: isoDateSchema,
});

export const hotelStatementResponseSchema = z.object({
  hotelId: uuidSchema,
  hotelName: z.string(),
  period: z.object({
    from: isoDateSchema,
    to: isoDateSchema,
  }),
  summary: z.object({
    totalBookings: z.number().int(),
    grossRevenue: moneySchema,
    totalCommission: moneySchema,
    totalRefunds: moneySchema,
    totalRefundCommissionReversal: moneySchema,
    netPayable: moneySchema,
  }),
  bookings: z.array(
    z.object({
      bookingId: uuidSchema,
      bookingReference: z.string(),
      checkIn: isoDateSchema,
      checkOut: isoDateSchema,
      grossAmount: moneySchema,
      commissionBps: basisPointsSchema,
      commissionAmount: moneySchema,
      refundAmount: moneySchema,
      refundCommissionReversal: moneySchema,
      netAmount: moneySchema,
      status: z.string(),
      paidOut: z.boolean(),
      payoutId: uuidSchema.nullable(),
    })
  ),
  generatedAt: isoDateTimeSchema,
});

// Payout
export const payoutBatchCreateSchema = z.object({
  name: z.string().min(1).max(255),
  dateFrom: isoDateSchema,
  dateTo: isoDateSchema,
  hotelIds: z.array(uuidSchema).optional(), // if omitted, all hotels with payable balance
  notes: z.string().max(2000).optional(),
});

export const payoutBatchResponseSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  dateFrom: isoDateSchema,
  dateTo: isoDateSchema,
  status: z.enum(['draft', 'processing', 'completed', 'failed']),
  totalAmount: moneySchema,
  totalCount: z.number().int(),
  processedCount: z.number().int(),
  failedCount: z.number().int(),
  createdBy: uuidSchema,
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});

export const payoutBatchListResponseSchema = paginatedResponseSchema(payoutBatchResponseSchema);

export const payoutRecordSchema = z.object({
  id: uuidSchema,
  batchId: uuidSchema.nullable(),
  hotelId: uuidSchema,
  hotelName: z.string(),
  amount: moneySchema,
  currency: z.string(),
  status: z.nativeEnum(PayoutStatus),
  reference: z.string().nullable(), // bank transfer reference
  evidenceUrl: z.string().url().nullable(),
  notes: z.string().nullable(),
  processedBy: uuidSchema.nullable(),
  processedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export const payoutRecordListResponseSchema = paginatedResponseSchema(payoutRecordSchema);

export const payoutMarkPaidSchema = z.object({
  reference: z.string().min(1).max(255),
  evidenceUrl: z.string().url().optional(),
  notes: z.string().max(1000).optional(),
  processedAt: isoDateTimeSchema.optional(),
});

// Reconciliation
export const reconciliationRunCreateSchema = z.object({
  name: z.string().min(1).max(255),
  dateFrom: isoDateSchema,
  dateTo: isoDateSchema,
  provider: z.string().optional(),
  hotelId: uuidSchema.optional(),
});

export const reconciliationRunResponseSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  dateFrom: isoDateSchema,
  dateTo: isoDateSchema,
  provider: z.string().nullable(),
  hotelId: uuidSchema.nullable(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  totalTransactions: z.number().int(),
  matchedCount: z.number().int(),
  discrepancyCount: z.number().int(),
  totalDiscrepancyAmount: moneySchema,
  createdBy: uuidSchema,
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});

export const reconciliationRunListResponseSchema = paginatedResponseSchema(
  reconciliationRunResponseSchema
);

export const reconciliationItemSchema = z.object({
  id: uuidSchema,
  runId: uuidSchema,
  type: z.enum(['payment', 'refund', 'payout', 'commission']),
  providerReference: z.string(),
  internalReference: uuidSchema.nullable(),
  providerAmount: moneySchema,
  internalAmount: moneySchema.nullable(),
  discrepancy: moneySchema.nullable(),
  status: z.enum(['matched', 'discrepancy', 'missing_internal', 'missing_provider', 'resolved']),
  resolutionNotes: z.string().nullable(),
  resolvedBy: uuidSchema.nullable(),
  resolvedAt: isoDateTimeSchema.nullable(),
});

export const reconciliationItemListResponseSchema =
  paginatedResponseSchema(reconciliationItemSchema);

// Audit Log
export const auditLogParamsSchema = paginationParamsSchema.extend({
  actorId: uuidSchema.optional(),
  actorType: z.enum(['customer', 'hotel_staff', 'admin', 'system']).optional(),
  action: z.string().optional(),
  entityType: z.string().optional(),
  entityId: uuidSchema.optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
});

export const auditLogEntrySchema = z.object({
  id: uuidSchema,
  actorId: uuidSchema.nullable(),
  actorType: z.enum(['customer', 'hotel_staff', 'admin', 'system']),
  actorEmail: z.string().email().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: uuidSchema.nullable(),
  oldValues: z.record(z.unknown()).nullable(),
  newValues: z.record(z.unknown()).nullable(),
  metadata: z.record(z.unknown()).optional(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  severity: z.enum(['info', 'warning', 'critical']),
  createdAt: isoDateTimeSchema,
});

export const auditLogListResponseSchema = paginatedResponseSchema(auditLogEntrySchema);

// Type exports
export type AdminHotelListParams = z.infer<typeof adminHotelListParamsSchema>;
export type AdminHotelDetailResponse = z.infer<typeof adminHotelDetailResponseSchema>;
export type AdminBookingListParams = z.infer<typeof adminBookingListParamsSchema>;
export type AdminBookingDetailResponse = z.infer<typeof adminBookingDetailResponseSchema>;

export type AdminCommissionAgreementCreate = z.infer<typeof adminCommissionAgreementCreateSchema>;
export type AdminCommissionAgreementUpdate = z.infer<typeof adminCommissionAgreementUpdateSchema>;
export type AdminCommissionAgreementResponse = z.infer<
  typeof adminCommissionAgreementResponseSchema
>;
export type AdminCommissionAgreementListResponse = z.infer<
  typeof adminCommissionAgreementListResponseSchema
>;

export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type LedgerTransaction = z.infer<typeof ledgerTransactionSchema>;
export type LedgerListParams = z.infer<typeof ledgerListParamsSchema>;
export type LedgerListResponse = z.infer<typeof ledgerListResponseSchema>;
export type LedgerTransactionListResponse = z.infer<typeof ledgerTransactionListResponseSchema>;

export type HotelStatementParams = z.infer<typeof hotelStatementParamsSchema>;
export type HotelStatementResponse = z.infer<typeof hotelStatementResponseSchema>;

export type PayoutBatchCreate = z.infer<typeof payoutBatchCreateSchema>;
export type PayoutBatchResponse = z.infer<typeof payoutBatchResponseSchema>;
export type PayoutBatchListResponse = z.infer<typeof payoutBatchListResponseSchema>;
export type PayoutRecord = z.infer<typeof payoutRecordSchema>;
export type PayoutRecordListResponse = z.infer<typeof payoutRecordListResponseSchema>;
export type PayoutMarkPaid = z.infer<typeof payoutMarkPaidSchema>;

export type ReconciliationRunCreate = z.infer<typeof reconciliationRunCreateSchema>;
export type ReconciliationRunResponse = z.infer<typeof reconciliationRunResponseSchema>;
export type ReconciliationRunListResponse = z.infer<typeof reconciliationRunListResponseSchema>;
export type ReconciliationItem = z.infer<typeof reconciliationItemSchema>;
export type ReconciliationItemListResponse = z.infer<typeof reconciliationItemListResponseSchema>;

export type AuditLogParams = z.infer<typeof auditLogParamsSchema>;
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
export type AuditLogListResponse = z.infer<typeof auditLogListResponseSchema>;
