// API entry point
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';

async function main(): Promise<void> {
  const app = await buildApp();

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down gracefully');
    try {
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Verify database connectivity before serving traffic
  try {
    await prisma.$queryRaw`SELECT 1`;
    app.log.info('Database connection verified');
  } catch (err) {
    app.log.error({ err }, 'Database connection failed');
    process.exit(1);
  }

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`API listening on ${env.API_BASE_URL}`);
  } catch (err) {
    app.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
