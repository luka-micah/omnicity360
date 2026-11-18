-- Record when a user accepted the terms of service.
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" TIMESTAMP(3);
