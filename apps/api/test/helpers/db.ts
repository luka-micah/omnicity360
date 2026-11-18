// Test database helpers. Integration tests run only against a database whose name ends in _test.
import { PrismaClient } from '@prisma/client';

export const testPrisma = new PrismaClient();

export async function resetDatabase(): Promise<void> {
  await testPrisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_logs",
      "verification_tokens",
      "user_sessions",
      "hotel_memberships",
      "hotel_status_history",
      "hotels",
      "customer_profiles",
      "partner_profiles",
      "users"
    RESTART IDENTITY CASCADE
  `);
}
