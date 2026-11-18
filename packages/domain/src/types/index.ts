// Shared type definitions for the Hotel Marketplace
// These are pure TypeScript types with no runtime dependencies.

export type UUID = string & { readonly __brand: unique symbol };
export type Email = string & { readonly __brand: unique symbol };
export type PhoneNumber = string & { readonly __brand: unique symbol };
export type CurrencyCode = 'NGN' | 'USD' | 'EUR' | 'GBP';
export type ISODateString = string & { readonly __brand: unique symbol };
export type ISODateTimeString = string & { readonly __brand: unique symbol };
export type IdempotencyKey = string & { readonly __brand: unique symbol };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[1-9]\d{1,14}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function uuid(value: string): UUID {
  if (!UUID_RE.test(value)) throw new Error(`Invalid UUID: ${value}`);
  return value as UUID;
}

export function email(value: string): Email {
  if (value.length > 255 || !EMAIL_RE.test(value)) throw new Error(`Invalid email: ${value}`);
  return value as Email;
}

export function phoneNumber(value: string): PhoneNumber {
  if (!PHONE_RE.test(value)) throw new Error(`Invalid phone number: ${value}`);
  return value as PhoneNumber;
}

export function currencyCode(value: string): CurrencyCode {
  if (!SUPPORTED_CURRENCIES.includes(value as CurrencyCode)) {
    throw new Error(`Unsupported currency: ${value}`);
  }
  return value as CurrencyCode;
}

export function isoDate(value: string): ISODateString {
  if (!ISO_DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return value as ISODateString;
}

export function isoDateTime(value: string): ISODateTimeString {
  if (Number.isNaN(Date.parse(value))) throw new Error(`Invalid ISO datetime: ${value}`);
  return value as ISODateTimeString;
}

export function idempotencyKey(value: string): IdempotencyKey {
  if (value.length === 0 || value.length > 128) throw new Error('Invalid idempotency key');
  return value as IdempotencyKey;
}

/** Money represented in integer minor units (kobo for NGN, cents for USD) */
export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export const SUPPORTED_CURRENCIES: readonly CurrencyCode[] = ['NGN', 'USD', 'EUR', 'GBP'];

/** Basis points: 100 = 1%, 500 = 5%, 1250 = 12.5% */
export type BasisPoints = number & { readonly __brand: unique symbol };

export function basisPoints(value: number): BasisPoints {
  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    throw new Error('Basis points must be an integer between 0 and 10000');
  }
  return value as BasisPoints;
}

/** User roles in the system */
export enum UserRole {
  GUEST = 'guest',
  CUSTOMER = 'customer',
  HOTEL_OWNER = 'hotel_owner',
  HOTEL_STAFF = 'hotel_staff',
  PLATFORM_SUPPORT = 'platform_support',
  PLATFORM_ADMIN = 'platform_admin',
}

/** Hotel lifecycle status */
export enum HotelStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived',
}

/** Booking lifecycle states */
export enum BookingStatus {
  PENDING_PAYMENT = 'pending_payment',
  CONFIRMED = 'confirmed',
  CHECKED_IN = 'checked_in',
  CHECKED_OUT = 'checked_out',
  COMPLETED = 'completed',
  CANCELLATION_REQUESTED = 'cancellation_requested',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  NO_SHOW = 'no_show',
  MANUAL_REVIEW = 'manual_review',
}

/** Payment lifecycle states */
export enum PaymentStatus {
  INITIALIZED = 'initialized',
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  ABANDONED = 'abandoned',
  EXPIRED = 'expired',
  REFUND_PENDING = 'refund_pending',
  PARTIALLY_REFUNDED = 'partially_refunded',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed',
}

/** Inventory modes for room categories */
export enum InventoryMode {
  CATEGORY_QUANTITY = 'category_quantity',
  PHYSICAL_ROOMS = 'physical_rooms',
}

/** Rate plan types */
export enum RatePlanType {
  STANDARD = 'standard',
  REFUNDABLE = 'refundable',
  NON_REFUNDABLE = 'non_refundable',
  CORPORATE = 'corporate',
  PROMOTIONAL = 'promotional',
}

/** Cancellation policy templates */
export enum CancellationPolicyTemplate {
  FLEXIBLE = 'flexible',
  MODERATE = 'moderate',
  STRICT = 'strict',
  NON_REFUNDABLE = 'non_refundable',
  CUSTOM = 'custom',
}

/** Ledger entry types */
export enum LedgerEntryType {
  BOOKING_REVENUE = 'booking_revenue',
  COMMISSION = 'commission',
  REFUND = 'refund',
  REFUND_COMMISSION_REVERSAL = 'refund_commission_reversal',
  PAYOUT = 'payout',
  PAYOUT_ADJUSTMENT = 'payout_adjustment',
  MANUAL_ADJUSTMENT = 'manual_adjustment',
}

/** Ledger account types (simplified double-entry) */
export enum LedgerAccountType {
  PLATFORM_REVENUE = 'platform_revenue',
  HOTEL_PAYABLE = 'hotel_payable',
  CUSTOMER_RECEIVABLE = 'customer_receivable',
  PAYMENT_PROVIDER_PAYABLE = 'payment_provider_payable',
  TAX_PAYABLE = 'tax_payable',
  CASH = 'cash',
}

/** Payout status */
export enum PayoutStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SENT = 'sent',
  FAILED = 'failed',
  RECONCILED = 'reconciled',
}

/** Audit log action categories */
export enum AuditAction {
  USER_REGISTERED = 'user_registered',
  USER_LOGGED_IN = 'user_logged_in',
  USER_LOGGED_OUT = 'user_logged_out',
  PASSWORD_RESET_REQUESTED = 'password_reset_requested',
  PASSWORD_CHANGED = 'password_changed',
  EMAIL_VERIFIED = 'email_verified',
  SESSION_REVOKED = 'session_revoked',
  HOTEL_CREATED = 'hotel_created',
  HOTEL_UPDATED = 'hotel_updated',
  HOTEL_SUBMITTED = 'hotel_submitted',
  HOTEL_REVIEW_STARTED = 'hotel_review_started',
  HOTEL_APPROVED = 'hotel_approved',
  HOTEL_REJECTED = 'hotel_rejected',
  HOTEL_SUSPENDED = 'hotel_suspended',
  HOTEL_REINSTATED = 'hotel_reinstated',
  HOTEL_ARCHIVED = 'hotel_archived',
  ROOM_CATEGORY_CREATED = 'room_category_created',
  ROOM_CATEGORY_UPDATED = 'room_category_updated',
  PHYSICAL_ROOM_CREATED = 'physical_room_created',
  PHYSICAL_ROOM_UPDATED = 'physical_room_updated',
  INVENTORY_UPDATED = 'inventory_updated',
  RATES_UPDATED = 'rates_updated',
  BOOKING_CREATED = 'booking_created',
  BOOKING_CONFIRMED = 'booking_confirmed',
  BOOKING_CANCELLED = 'booking_cancelled',
  BOOKING_CHECKED_IN = 'booking_checked_in',
  BOOKING_CHECKED_OUT = 'booking_checked_out',
  BOOKING_NO_SHOW = 'booking_no_show',
  BOOKING_EXPIRED = 'booking_expired',
  PAYMENT_INITIALIZED = 'payment_initialized',
  PAYMENT_SUCCEEDED = 'payment_succeeded',
  PAYMENT_FAILED = 'payment_failed',
  PAYMENT_REFUNDED = 'payment_refunded',
  PAYMENT_DISPUTED = 'payment_disputed',
  COMMISSION_AGREEMENT_CREATED = 'commission_agreement_created',
  COMMISSION_AGREEMENT_UPDATED = 'commission_agreement_updated',
  PAYOUT_BATCH_CREATED = 'payout_batch_created',
  PAYOUT_RECORDED = 'payout_recorded',
  RECONCILIATION_RUN = 'reconciliation_run',
  USER_ROLE_CHANGED = 'user_role_changed',
  STAFF_INVITED = 'staff_invited',
  STAFF_INVITATION_ACCEPTED = 'staff_invitation_accepted',
  STAFF_REVOKED = 'staff_revoked',
  PLATFORM_SETTING_CHANGED = 'platform_setting_changed',
}

/** Common pagination params */
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** Date range with check-in inclusive, check-out exclusive semantics */
export interface DateRange {
  checkIn: ISODateString;
  checkOut: ISODateString;
}

/** Standard API error response */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}
