// Environment configuration with validation
import './load-env.js';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  WEB_BASE_URL: z.string().url().default('http://localhost:3000'),
  MOBILE_SCHEME: z.string().default('hotelmarketplace'),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis (optional through Phase 2; required for distributed rate limits/workers later)
  REDIS_URL: z.string().url().optional(),

  // Session
  SESSION_SECRET: z.string().min(32).default('dev-only-session-secret-change-me-32chars'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  REMEMBER_ME_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),

  // Payment provider (blocked until marketplace/settlement validation)
  PAYMENT_PROVIDER: z.string().optional(),
  PAYMENT_SECRET_KEY: z.string().optional(),
  PAYMENT_PUBLIC_KEY: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),

  // Email (not implemented yet; development tokens are used until configured)
  EMAIL_PROVIDER: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  // Storage (later phase; media metadata only for now)
  STORAGE_PROVIDER: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  const insecureSessionSecrets = new Set([
    'dev-only-session-secret-change-me-32chars',
    'replace-with-at-least-32-random-characters',
  ]);
  if (
    result.data.NODE_ENV === 'production' &&
    insecureSessionSecrets.has(result.data.SESSION_SECRET)
  ) {
    throw new Error('SESSION_SECRET must be set to a unique value in production');
  }
  return result.data;
}

export const env = loadEnv();
