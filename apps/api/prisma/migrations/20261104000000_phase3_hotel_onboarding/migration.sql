-- Phase 3: hotel onboarding lifecycle records.
-- AlterTable
ALTER TABLE "hotels" ADD COLUMN     "submission_notes" TEXT;

-- CreateTable
CREATE TABLE "hotel_status_history" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "from_status" "HotelStatus",
    "to_status" "HotelStatus" NOT NULL,
    "actor_id" UUID,
    "actor_type" VARCHAR(20) NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hotel_status_history_hotel_id_created_at_idx" ON "hotel_status_history"("hotel_id", "created_at");

-- CreateIndex
CREATE INDEX "hotel_status_history_actor_id_idx" ON "hotel_status_history"("actor_id");

-- CreateIndex
CREATE INDEX "hotels_partner_id_status_idx" ON "hotels"("partner_id", "status");

-- CreateIndex
CREATE INDEX "hotels_status_created_at_idx" ON "hotels"("status", "created_at");

-- AddForeignKey
ALTER TABLE "hotel_status_history" ADD CONSTRAINT "hotel_status_history_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_status_history" ADD CONSTRAINT "hotel_status_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
