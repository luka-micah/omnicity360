import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'dist/', 'prisma/', 'scripts/'],
    },
    testTimeout: 15000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
