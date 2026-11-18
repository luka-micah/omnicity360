-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('customer', 'hotel_owner', 'hotel_staff', 'platform_support', 'platform_admin');

-- CreateEnum
CREATE TYPE "HotelStatus" AS ENUM ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "InventoryMode" AS ENUM ('category_quantity', 'physical_rooms');

-- CreateEnum
CREATE TYPE "RatePlanType" AS ENUM ('standard', 'refundable', 'non_refundable', 'corporate', 'promotional');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('available', 'maintenance', 'out_of_service');

-- CreateEnum
CREATE TYPE "CancellationPolicyTemplate" AS ENUM ('flexible', 'moderate', 'strict', 'non_refundable', 'custom');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending_payment', 'confirmed', 'checked_in', 'checked_out', 'completed', 'cancellation_requested', 'cancelled', 'expired', 'no_show', 'manual_review');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('initialized', 'pending', 'processing', 'succeeded', 'failed', 'abandoned', 'expired', 'refund_pending', 'partially_refunded', 'refunded', 'disputed');

-- CreateEnum
CREATE TYPE "CommissionAgreementStatus" AS ENUM ('draft', 'active', 'superseded', 'terminated');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('platform_revenue', 'hotel_payable', 'customer_receivable', 'payment_provider_payable', 'tax_payable', 'cash');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('booking_revenue', 'commission', 'refund', 'refund_commission_reversal', 'payout', 'payout_adjustment', 'manual_adjustment');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'processing', 'sent', 'failed', 'reconciled');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(20),
    "role" "UserRole" NOT NULL DEFAULT 'customer',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date_of_birth" DATE,
    "nationality" VARCHAR(2),
    "address_line1" VARCHAR(255),
    "address_line2" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "country" VARCHAR(2) NOT NULL DEFAULT 'NG',
    "postal_code" VARCHAR(20),
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token" VARCHAR(500) NOT NULL,
    "device_info" VARCHAR(500),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotels" (
    "id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "property_type" VARCHAR(50) NOT NULL,
    "address_line1" VARCHAR(255) NOT NULL,
    "address_line2" VARCHAR(255),
    "city" VARCHAR(100) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "country" VARCHAR(2) NOT NULL DEFAULT 'NG',
    "postal_code" VARCHAR(20),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(20),
    "contact_website" VARCHAR(255),
    "check_in_time" VARCHAR(5) NOT NULL DEFAULT '14:00',
    "check_out_time" VARCHAR(5) NOT NULL DEFAULT '11:00',
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "house_rules" TEXT,
    "accessibility_info" TEXT,
    "default_commission_bps" INTEGER,
    "status" "HotelStatus" NOT NULL DEFAULT 'draft',
    "rejection_reason" TEXT,
    "internal_notes" TEXT,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "suspended_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_memberships" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "invited_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "hotel_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_media" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "caption" VARCHAR(500),
    "alt_text" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "mime_type" VARCHAR(100),
    "width" INTEGER,
    "height" INTEGER,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_documents" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "description" VARCHAR(500),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by" UUID,
    "verified_at" TIMESTAMP(3),
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_categories" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "max_adults" INTEGER NOT NULL DEFAULT 2,
    "max_children" INTEGER NOT NULL DEFAULT 2,
    "bed_configuration" VARCHAR(100),
    "room_size_sqm" DOUBLE PRECISION,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "smoking_allowed" BOOLEAN NOT NULL DEFAULT false,
    "accessible" BOOLEAN NOT NULL DEFAULT false,
    "inventory_mode" "InventoryMode" NOT NULL DEFAULT 'category_quantity',
    "total_quantity" INTEGER,
    "base_rate_amount" INTEGER NOT NULL,
    "base_rate_currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_category_media" (
    "id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "caption" VARCHAR(500),
    "alt_text" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_category_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_rooms" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "room_number" VARCHAR(50) NOT NULL,
    "floor" INTEGER,
    "description" TEXT,
    "status" "RoomStatus" NOT NULL DEFAULT 'available',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "physical_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_plans" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "RatePlanType" NOT NULL DEFAULT 'standard',
    "description" TEXT,
    "base_rate_amount" INTEGER NOT NULL,
    "base_rate_currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "cancellation_policy_id" UUID,
    "min_stay_nights" INTEGER NOT NULL DEFAULT 1,
    "max_stay_nights" INTEGER,
    "closed_to_arrival" DATE[] DEFAULT ARRAY[]::DATE[],
    "closed_to_departure" DATE[] DEFAULT ARRAY[]::DATE[],
    "advance_purchase_days" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nightly_rates" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "rate_plan_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "rate_amount" INTEGER NOT NULL,
    "rate_currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "min_stay" INTEGER,
    "max_stay" INTEGER,
    "closed_to_arrival" BOOLEAN NOT NULL DEFAULT false,
    "closed_to_departure" BOOLEAN NOT NULL DEFAULT false,
    "stop_sell" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nightly_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_days" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "stop_sell" BOOLEAN NOT NULL DEFAULT false,
    "min_stay" INTEGER,
    "max_stay" INTEGER,
    "closed_to_arrival" BOOLEAN NOT NULL DEFAULT false,
    "closed_to_departure" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_holds" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "booking_id" UUID,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_blocks" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "room_category_id" UUID,
    "physical_room_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellation_policies" (
    "id" UUID NOT NULL,
    "hotel_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "template" "CancellationPolicyTemplate" NOT NULL,
    "description" TEXT NOT NULL,
    "free_cancellation_until_hours_before_check_in" INTEGER,
    "refund_percent_before_days" INTEGER,
    "refund_percent_after_days" INTEGER,
    "custom_rules" JSONB,
    "is_platform_template" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cancellation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(50) NOT NULL,
    "access_token" VARCHAR(100) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending_payment',
    "hotel_id" UUID NOT NULL,
    "customer_id" UUID,
    "room_category_id" UUID NOT NULL,
    "guest_first_name" VARCHAR(100) NOT NULL,
    "guest_last_name" VARCHAR(100) NOT NULL,
    "guest_email" VARCHAR(255) NOT NULL,
    "guest_phone" VARCHAR(20) NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL DEFAULT 0,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "special_requests" TEXT,
    "subtotal_amount" INTEGER NOT NULL,
    "subtotal_currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "tax_amount" INTEGER NOT NULL DEFAULT 0,
    "fees_amount" INTEGER NOT NULL DEFAULT 0,
    "total_amount" INTEGER NOT NULL,
    "total_currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "cancellation_policy_id" UUID,
    "cancellation_policy_snapshot" JSONB,
    "commission_bps" INTEGER,
    "commission_amount" INTEGER,
    "commission_basis" VARCHAR(50),
    "hold_expires_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "checked_in_at" TIMESTAMP(3),
    "checked_out_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "expired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_rooms" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "room_category_name" VARCHAR(100) NOT NULL,
    "rate_plan_id" UUID NOT NULL,
    "rate_plan_name" VARCHAR(100) NOT NULL,
    "rate_plan_type" VARCHAR(50) NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "subtotal_amount" INTEGER NOT NULL,
    "subtotal_currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "tax_amount" INTEGER NOT NULL DEFAULT 0,
    "fees_amount" INTEGER NOT NULL DEFAULT 0,
    "total_amount" INTEGER NOT NULL,
    "total_currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_nights" (
    "id" UUID NOT NULL,
    "booking_room_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "rate_amount" INTEGER NOT NULL,
    "rate_currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "rate_plan_id" UUID NOT NULL,
    "rate_plan_name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_nights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_guests" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "special_requests" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_status_history" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "from_status" "BookingStatus",
    "to_status" "BookingStatus" NOT NULL,
    "actor_id" UUID,
    "actor_type" VARCHAR(20) NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellation_requests" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "requested_by" VARCHAR(20) NOT NULL,
    "requester_id" UUID,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "refund_amount" INTEGER,
    "refund_currency" VARCHAR(3),
    "decided_by" UUID,
    "decision_notes" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cancellation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_reference" VARCHAR(255) NOT NULL,
    "provider_checkout_url" VARCHAR(1000),
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "status" "PaymentStatus" NOT NULL DEFAULT 'initialized',
    "idempotency_key" VARCHAR(128),
    "customer_email" VARCHAR(255) NOT NULL,
    "customer_name" VARCHAR(255) NOT NULL,
    "customer_phone" VARCHAR(20) NOT NULL,
    "failure_reason" TEXT,
    "metadata" JSONB,
    "initialized_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_provider_events" (
    "id" UUID NOT NULL,
    "payment_id" UUID,
    "provider" VARCHAR(50) NOT NULL,
    "provider_event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "processing_error" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "reason" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "provider_refund_id" VARCHAR(255),
    "idempotency_key" VARCHAR(128),
    "initiated_by" VARCHAR(20) NOT NULL,
    "processed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_agreements" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "commission_bps" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "terms" TEXT,
    "signed_document_url" VARCHAR(500),
    "status" "CommissionAgreementStatus" NOT NULL DEFAULT 'draft',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_commission_snapshots" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "commission_bps" INTEGER NOT NULL,
    "calculation_basis" VARCHAR(50) NOT NULL,
    "discount_funded_by" VARCHAR(20) NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_commission_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "reference" VARCHAR(255),
    "reference_type" VARCHAR(50),
    "idempotency_key" VARCHAR(128),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "account_type" "LedgerAccountType" NOT NULL,
    "account_id" UUID NOT NULL,
    "entry_type" "LedgerEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "description" VARCHAR(500) NOT NULL,
    "hotel_id" UUID,
    "booking_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_batches" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "total_amount" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_payouts" (
    "id" UUID NOT NULL,
    "batch_id" UUID,
    "hotel_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "reference" VARCHAR(255),
    "evidence_url" VARCHAR(500),
    "notes" TEXT,
    "processed_by" UUID,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_statements" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "gross_revenue" INTEGER NOT NULL,
    "total_commission" INTEGER NOT NULL,
    "total_refunds" INTEGER NOT NULL,
    "net_payable" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "booking_count" INTEGER NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_runs" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "provider" VARCHAR(50),
    "hotel_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "total_transactions" INTEGER NOT NULL DEFAULT 0,
    "matched_count" INTEGER NOT NULL DEFAULT 0,
    "discrepancy_count" INTEGER NOT NULL DEFAULT 0,
    "total_discrepancy_amount" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_items" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "provider_reference" VARCHAR(255) NOT NULL,
    "internal_reference" UUID,
    "provider_amount" INTEGER NOT NULL,
    "internal_amount" INTEGER,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "discrepancy" INTEGER,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "resolution_notes" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "booking_id" UUID,
    "type" VARCHAR(50) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "recipient" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255),
    "body" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "provider_message_id" VARCHAR(255),
    "sent_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "scheduled_for" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_type" VARCHAR(20) NOT NULL,
    "actor_email" VARCHAR(255),
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID,
    "old_values" JSONB,
    "new_values" JSONB,
    "metadata" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "severity" VARCHAR(20) NOT NULL DEFAULT 'info',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "user_id" UUID,
    "operation" VARCHAR(100) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "response_body" JSONB,
    "status_code" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_user_id_key" ON "customer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refresh_token_key" ON "user_sessions"("refresh_token");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_refresh_token_idx" ON "user_sessions"("refresh_token");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE INDEX "verification_tokens_user_id_idx" ON "verification_tokens"("user_id");

-- CreateIndex
CREATE INDEX "verification_tokens_token_idx" ON "verification_tokens"("token");

-- CreateIndex
CREATE INDEX "verification_tokens_expires_at_idx" ON "verification_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "hotels_slug_key" ON "hotels"("slug");

-- CreateIndex
CREATE INDEX "hotels_status_idx" ON "hotels"("status");

-- CreateIndex
CREATE INDEX "hotels_city_state_idx" ON "hotels"("city", "state");

-- CreateIndex
CREATE INDEX "hotels_partner_id_idx" ON "hotels"("partner_id");

-- CreateIndex
CREATE INDEX "hotels_slug_idx" ON "hotels"("slug");

-- CreateIndex
CREATE INDEX "hotel_memberships_user_id_idx" ON "hotel_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_memberships_hotel_id_user_id_key" ON "hotel_memberships"("hotel_id", "user_id");

-- CreateIndex
CREATE INDEX "hotel_media_hotel_id_idx" ON "hotel_media"("hotel_id");

-- CreateIndex
CREATE INDEX "hotel_documents_hotel_id_idx" ON "hotel_documents"("hotel_id");

-- CreateIndex
CREATE INDEX "room_categories_hotel_id_idx" ON "room_categories"("hotel_id");

-- CreateIndex
CREATE INDEX "room_categories_hotel_id_is_active_idx" ON "room_categories"("hotel_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "room_categories_hotel_id_slug_key" ON "room_categories"("hotel_id", "slug");

-- CreateIndex
CREATE INDEX "room_category_media_room_category_id_idx" ON "room_category_media"("room_category_id");

-- CreateIndex
CREATE INDEX "physical_rooms_hotel_id_idx" ON "physical_rooms"("hotel_id");

-- CreateIndex
CREATE INDEX "physical_rooms_room_category_id_idx" ON "physical_rooms"("room_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "physical_rooms_hotel_id_room_number_key" ON "physical_rooms"("hotel_id", "room_number");

-- CreateIndex
CREATE INDEX "rate_plans_hotel_id_idx" ON "rate_plans"("hotel_id");

-- CreateIndex
CREATE INDEX "rate_plans_room_category_id_idx" ON "rate_plans"("room_category_id");

-- CreateIndex
CREATE INDEX "nightly_rates_hotel_id_date_idx" ON "nightly_rates"("hotel_id", "date");

-- CreateIndex
CREATE INDEX "nightly_rates_room_category_id_date_idx" ON "nightly_rates"("room_category_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "nightly_rates_hotel_id_room_category_id_rate_plan_id_date_key" ON "nightly_rates"("hotel_id", "room_category_id", "rate_plan_id", "date");

-- CreateIndex
CREATE INDEX "inventory_days_hotel_id_date_idx" ON "inventory_days"("hotel_id", "date");

-- CreateIndex
CREATE INDEX "inventory_days_room_category_id_date_idx" ON "inventory_days"("room_category_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_days_room_category_id_date_key" ON "inventory_days"("room_category_id", "date");

-- CreateIndex
CREATE INDEX "inventory_holds_hotel_id_idx" ON "inventory_holds"("hotel_id");

-- CreateIndex
CREATE INDEX "inventory_holds_room_category_id_check_in_check_out_idx" ON "inventory_holds"("room_category_id", "check_in", "check_out");

-- CreateIndex
CREATE INDEX "inventory_holds_status_expires_at_idx" ON "inventory_holds"("status", "expires_at");

-- CreateIndex
CREATE INDEX "maintenance_blocks_hotel_id_start_date_end_date_idx" ON "maintenance_blocks"("hotel_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "maintenance_blocks_physical_room_id_start_date_end_date_idx" ON "maintenance_blocks"("physical_room_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "cancellation_policies_hotel_id_idx" ON "cancellation_policies"("hotel_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_reference_key" ON "bookings"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_access_token_key" ON "bookings"("access_token");

-- CreateIndex
CREATE INDEX "bookings_reference_idx" ON "bookings"("reference");

-- CreateIndex
CREATE INDEX "bookings_access_token_idx" ON "bookings"("access_token");

-- CreateIndex
CREATE INDEX "bookings_hotel_id_status_idx" ON "bookings"("hotel_id", "status");

-- CreateIndex
CREATE INDEX "bookings_customer_id_idx" ON "bookings"("customer_id");

-- CreateIndex
CREATE INDEX "bookings_check_in_check_out_idx" ON "bookings"("check_in", "check_out");

-- CreateIndex
CREATE INDEX "bookings_status_hold_expires_at_idx" ON "bookings"("status", "hold_expires_at");

-- CreateIndex
CREATE INDEX "booking_rooms_booking_id_idx" ON "booking_rooms"("booking_id");

-- CreateIndex
CREATE INDEX "booking_nights_booking_room_id_idx" ON "booking_nights"("booking_room_id");

-- CreateIndex
CREATE INDEX "booking_guests_booking_id_idx" ON "booking_guests"("booking_id");

-- CreateIndex
CREATE INDEX "booking_status_history_booking_id_idx" ON "booking_status_history"("booking_id");

-- CreateIndex
CREATE INDEX "cancellation_requests_booking_id_idx" ON "cancellation_requests"("booking_id");

-- CreateIndex
CREATE INDEX "cancellation_requests_status_idx" ON "cancellation_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_reference_key" ON "payments"("provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "payments_provider_reference_idx" ON "payments"("provider_reference");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payment_provider_events_payment_id_idx" ON "payment_provider_events"("payment_id");

-- CreateIndex
CREATE INDEX "payment_provider_events_event_type_idx" ON "payment_provider_events"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_events_provider_provider_event_id_key" ON "payment_provider_events"("provider", "provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_idempotency_key_key" ON "refunds"("idempotency_key");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "refunds_status_idx" ON "refunds"("status");

-- CreateIndex
CREATE INDEX "commission_agreements_hotel_id_idx" ON "commission_agreements"("hotel_id");

-- CreateIndex
CREATE INDEX "commission_agreements_status_idx" ON "commission_agreements"("status");

-- CreateIndex
CREATE INDEX "commission_agreements_effective_from_effective_to_idx" ON "commission_agreements"("effective_from", "effective_to");

-- CreateIndex
CREATE UNIQUE INDEX "booking_commission_snapshots_booking_id_key" ON "booking_commission_snapshots"("booking_id");

-- CreateIndex
CREATE INDEX "booking_commission_snapshots_hotel_id_idx" ON "booking_commission_snapshots"("hotel_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_idempotency_key_key" ON "ledger_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_transactions_reference_reference_type_idx" ON "ledger_transactions"("reference", "reference_type");

-- CreateIndex
CREATE INDEX "ledger_transactions_created_at_idx" ON "ledger_transactions"("created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");

-- CreateIndex
CREATE INDEX "ledger_entries_account_type_account_id_idx" ON "ledger_entries"("account_type", "account_id");

-- CreateIndex
CREATE INDEX "ledger_entries_hotel_id_idx" ON "ledger_entries"("hotel_id");

-- CreateIndex
CREATE INDEX "ledger_entries_booking_id_idx" ON "ledger_entries"("booking_id");

-- CreateIndex
CREATE INDEX "payout_batches_status_idx" ON "payout_batches"("status");

-- CreateIndex
CREATE INDEX "payout_batches_created_at_idx" ON "payout_batches"("created_at");

-- CreateIndex
CREATE INDEX "hotel_payouts_batch_id_idx" ON "hotel_payouts"("batch_id");

-- CreateIndex
CREATE INDEX "hotel_payouts_hotel_id_status_idx" ON "hotel_payouts"("hotel_id", "status");

-- CreateIndex
CREATE INDEX "hotel_statements_hotel_id_idx" ON "hotel_statements"("hotel_id");

-- CreateIndex
CREATE INDEX "hotel_statements_period_from_period_to_idx" ON "hotel_statements"("period_from", "period_to");

-- CreateIndex
CREATE INDEX "reconciliation_runs_status_idx" ON "reconciliation_runs"("status");

-- CreateIndex
CREATE INDEX "reconciliation_runs_created_at_idx" ON "reconciliation_runs"("created_at");

-- CreateIndex
CREATE INDEX "reconciliation_items_run_id_idx" ON "reconciliation_items"("run_id");

-- CreateIndex
CREATE INDEX "reconciliation_items_status_idx" ON "reconciliation_items"("status");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_booking_id_idx" ON "notifications"("booking_id");

-- CreateIndex
CREATE INDEX "notifications_status_scheduled_for_idx" ON "notifications"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_key_key" ON "idempotency_records"("key");

-- CreateIndex
CREATE INDEX "idempotency_records_key_idx" ON "idempotency_records"("key");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_memberships" ADD CONSTRAINT "hotel_memberships_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_memberships" ADD CONSTRAINT "hotel_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_media" ADD CONSTRAINT "hotel_media_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_documents" ADD CONSTRAINT "hotel_documents_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_categories" ADD CONSTRAINT "room_categories_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_category_media" ADD CONSTRAINT "room_category_media_room_category_id_fkey" FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_rooms" ADD CONSTRAINT "physical_rooms_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_rooms" ADD CONSTRAINT "physical_rooms_room_category_id_fkey" FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_room_category_id_fkey" FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nightly_rates" ADD CONSTRAINT "nightly_rates_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_days" ADD CONSTRAINT "inventory_days_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_days" ADD CONSTRAINT "inventory_days_room_category_id_fkey" FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_holds" ADD CONSTRAINT "inventory_holds_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_blocks" ADD CONSTRAINT "maintenance_blocks_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_blocks" ADD CONSTRAINT "maintenance_blocks_physical_room_id_fkey" FOREIGN KEY ("physical_room_id") REFERENCES "physical_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_policies" ADD CONSTRAINT "cancellation_policies_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_category_id_fkey" FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_rooms" ADD CONSTRAINT "booking_rooms_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_nights" ADD CONSTRAINT "booking_nights_booking_room_id_fkey" FOREIGN KEY ("booking_room_id") REFERENCES "booking_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_guests" ADD CONSTRAINT "booking_guests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_agreements" ADD CONSTRAINT "commission_agreements_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_commission_snapshots" ADD CONSTRAINT "booking_commission_snapshots_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_commission_snapshots" ADD CONSTRAINT "booking_commission_snapshots_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_payouts" ADD CONSTRAINT "hotel_payouts_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "payout_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_payouts" ADD CONSTRAINT "hotel_payouts_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_statements" ADD CONSTRAINT "hotel_statements_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "reconciliation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
