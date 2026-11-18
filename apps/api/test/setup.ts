// Test setup - sets required environment before app import.
process.env.NODE_ENV = 'test';

const fallbackTestDatabaseUrl =
  'postgresql://postgres:postgres@localhost:5432/hotel_marketplace_test?schema=public';
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? fallbackTestDatabaseUrl;
const testDatabaseName = new URL(testDatabaseUrl).pathname.replace(/^\/+/, '');
if (!testDatabaseName.endsWith('_test')) {
  throw new Error(
    `Refusing to run tests against "${testDatabaseName}": the database name must end with "_test"`
  );
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.SESSION_SECRET = 'test-session-secret-that-is-at-least-32-chars';
process.env.LOG_LEVEL = 'error';
