// Access and refresh token utilities.
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';
import { SignJWT, jwtVerify } from 'jose';

import { env } from '../config/env.js';
import { UnauthorizedError } from '../errors/index.js';

const ISSUER = 'hotel-marketplace';
const AUDIENCE = 'hotel-marketplace-api';
const key = new TextEncoder().encode(env.SESSION_SECRET);

export const REFRESH_COOKIE_NAME = 'hm_refresh';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens are stored as SHA-256 hashes; a database leak must not expose usable tokens. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export async function signAccessToken(userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(key);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw new Error('Missing claims');
    }
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    throw new UnauthorizedError('Authentication required');
  }
}

export function refreshTokenExpiry(rememberMe = false): Date {
  const days = rememberMe ? env.REMEMBER_ME_TTL_DAYS : env.REFRESH_TOKEN_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function verificationExpiry(kind: 'email_verification' | 'password_reset'): Date {
  const ms =
    kind === 'password_reset'
      ? env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000
      : env.EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

export function setRefreshCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(REFRESH_COOKIE_NAME, token, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
  });
}

export function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

export function readRefreshToken(
  request: FastifyRequest,
  bodyToken?: string | null
): string | undefined {
  return bodyToken ?? request.cookies?.[REFRESH_COOKIE_NAME];
}
