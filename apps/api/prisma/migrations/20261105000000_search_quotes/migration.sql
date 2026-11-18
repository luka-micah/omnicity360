-- Persist server-calculated quotes until their short booking window expires.
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "rate_plan_id" UUID NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL DEFAULT 0,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB NOT NULL,
    "commission_agreement_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quotes_expires_at_idx" ON "quotes"("expires_at");
CREATE INDEX "quotes_hotel_id_check_in_check_out_idx" ON "quotes"("hotel_id", "check_in", "check_out");

ALTER TABLE "quotes"
    ADD CONSTRAINT "quotes_hotel_id_fkey"
    FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotes"
    ADD CONSTRAINT "quotes_room_category_id_fkey"
    FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotes"
    ADD CONSTRAINT "quotes_rate_plan_id_fkey"
    FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nightly_rates"
    ADD CONSTRAINT "nightly_rates_rate_plan_id_fkey"
    FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_commission_snapshots"
    ALTER COLUMN "agreement_id" DROP NOT NULL;
