// Authentication and session endpoints.
import {
  authResponseSchema,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  forgotPasswordResponseSchema,
  loginRequestSchema,
  messageResponseSchema,
  partnerRegisterRequestSchema,
  registerRequestSchema,
  registerResponseSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
  verifyEmailResponseSchema,
} from '@hotel-marketplace/contracts';
import { AuditAction } from '@hotel-marketplace/domain';
import type { User } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { writeAuditLog } from '../auth/audit.js';
import { authenticate } from '../auth/guard.js';
import { toUserProfile } from '../auth/serializers.js';
import {
  clearRefreshCookie,
  generateOpaqueToken,
  hashToken,
  readRefreshToken,
  refreshTokenExpiry,
  setRefreshCookie,
  signAccessToken,
  verificationExpiry,
} from '../auth/tokens.js';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { ConflictError, UnauthorizedError, ValidationError } from '../errors/index.js';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../lib/password.js';
import { apiSchema } from '../openapi/schema.js';

const EMAIL_VERIFICATION = 'email_verification';
const PASSWORD_RESET = 'password_reset';

// A valid bcrypt hash used to keep login timing similar when the account does not exist.
const DUMMY_PASSWORD_HASH = '$2a$12$fS3oPGxNQuQ5j3.chmvaWuYUGTv6WLjpBu.U7QDfs7HIzOfSpUNRO';

const optionalRefreshBodySchema = z.object({ refreshToken: z.string().min(1).nullish() }).nullish();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Prisma unique-constraint race, e.g. two registrations for the same email. */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function assertStrongPassword(password: string): void {
  const strength = validatePasswordStrength(password);
  if (!strength.valid) {
    throw new ValidationError('Password does not meet requirements', {
      reasons: strength.reasons,
    });
  }
}

function userAgent(request: FastifyRequest): string | null {
  const value = request.headers['user-agent'];
  return typeof value === 'string' ? value.slice(0, 500) : null;
}

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

async function startSession(
  user: User,
  request: FastifyRequest,
  rememberMe: boolean,
  auditAction: AuditAction | null
): Promise<{ tokens: SessionTokens; refreshExpiresAt: Date }> {
  const rawRefreshToken = generateOpaqueToken();
  const refreshExpiresAt = refreshTokenExpiry(rememberMe);

  const sessionId = await prisma.$transaction(async (tx) => {
    const session = await tx.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashToken(rawRefreshToken),
        ipAddress: request.ip.slice(0, 45),
        userAgent: userAgent(request),
        expiresAt: refreshExpiresAt,
      },
    });

    await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    if (auditAction) {
      await writeAuditLog(tx, request, {
        actorId: user.id,
        actorType: user.role,
        actorEmail: user.email,
        action: auditAction,
        entityType: 'user_session',
        entityId: session.id,
      });
    }

    return session.id;
  });

  const accessToken = await signAccessToken(user.id, sessionId);

  return {
    tokens: {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
      tokenType: 'Bearer',
    },
    refreshExpiresAt,
  };
}

function authResponse(user: User, tokens: SessionTokens) {
  return { user: toUserProfile(user), tokens };
}

async function createAccount(
  request: FastifyRequest,
  input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    role: 'customer' | 'hotel_owner';
    companyName?: string;
    companyRegistrationNumber?: string;
  }
): Promise<{ user: User; verificationToken: string }> {
  const email = normalizeEmail(input.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError(
      'EMAIL_ALREADY_REGISTERED',
      'An account with this email already exists'
    );
  }

  assertStrongPassword(input.password);
  const passwordHash = await hashPassword(input.password);
  const rawVerificationToken = generateOpaqueToken();

  let user: User;
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
          role: input.role,
          termsAcceptedAt: new Date(),
          ...(input.role === 'customer'
            ? { customerProfile: { create: {} } }
            : {
                partnerProfile: {
                  create: {
                    companyName: input.companyName ?? 'Unnamed partner',
                    companyRegistrationNumber: input.companyRegistrationNumber ?? null,
                  },
                },
              }),
          verificationTokens: {
            create: {
              token: hashToken(rawVerificationToken),
              type: EMAIL_VERIFICATION,
              expiresAt: verificationExpiry('email_verification'),
            },
          },
        },
      });

      await writeAuditLog(tx, request, {
        actorId: created.id,
        actorType: created.role,
        actorEmail: created.email,
        action: AuditAction.USER_REGISTERED,
        entityType: 'user',
        entityId: created.id,
        metadata: { role: created.role },
      });

      return created;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists'
      );
    }
    throw error;
  }

  return { user, verificationToken: rawVerificationToken };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/register',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: {
        tags: ['Auth'],
        summary: 'Register a customer account',
        body: apiSchema(registerRequestSchema),
        response: { 201: apiSchema(registerResponseSchema) },
      },
    },
    async (request, reply) => {
      const body = registerRequestSchema.parse(request.body);
      const { user, verificationToken } = await createAccount(request, {
        email: body.email,
        password: body.password,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        role: 'customer',
      });
      const session = await startSession(user, request, false, null);
      setRefreshCookie(reply, session.tokens.refreshToken, session.refreshExpiresAt);
      reply.status(201);
      return {
        ...authResponse(user, session.tokens),
        ...(env.NODE_ENV !== 'production' ? { devEmailVerificationToken: verificationToken } : {}),
      };
    }
  );

  app.post(
    '/partner/register',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: {
        tags: ['Auth'],
        summary: 'Register a hotel partner account',
        body: apiSchema(partnerRegisterRequestSchema),
        response: { 201: apiSchema(registerResponseSchema) },
      },
    },
    async (request, reply) => {
      const body = partnerRegisterRequestSchema.parse(request.body);
      const { user, verificationToken } = await createAccount(request, {
        email: body.email,
        password: body.password,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        role: 'hotel_owner',
        companyName: body.companyName,
        companyRegistrationNumber: body.companyRegistrationNumber,
      });
      const session = await startSession(user, request, false, null);
      setRefreshCookie(reply, session.tokens.refreshToken, session.refreshExpiresAt);
      reply.status(201);
      return {
        ...authResponse(user, session.tokens),
        ...(env.NODE_ENV !== 'production' ? { devEmailVerificationToken: verificationToken } : {}),
      };
    }
  );

  app.post(
    '/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Sign in with email and password',
        body: apiSchema(loginRequestSchema),
        response: { 200: apiSchema(authResponseSchema) },
      },
    },
    async (request, reply) => {
      const body = loginRequestSchema.parse(request.body);
      const email = normalizeEmail(body.email);
      const user = await prisma.user.findUnique({ where: { email } });

      // Always run bcrypt so unknown accounts are not distinguishable by response time.
      const passwordMatches = await verifyPassword(
        body.password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH
      );
      if (!user || !user.isActive || !passwordMatches) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const session = await startSession(
        user,
        request,
        body.rememberMe ?? false,
        AuditAction.USER_LOGGED_IN
      );
      setRefreshCookie(reply, session.tokens.refreshToken, session.refreshExpiresAt);
      return authResponse(user, session.tokens);
    }
  );

  app.post(
    '/refresh',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Rotate a refresh token and issue a new access token',
        description:
          'Accepts the refresh token in the JSON body or in the HttpOnly hm_refresh cookie.',
        response: { 200: apiSchema(authResponseSchema) },
      },
    },
    async (request, reply) => {
      const body = optionalRefreshBodySchema.parse(request.body) ?? {};
      const rawToken = readRefreshToken(request, body.refreshToken);
      if (!rawToken) throw new UnauthorizedError('Invalid refresh token');

      const oldHash = hashToken(rawToken);
      const session = await prisma.userSession.findUnique({
        where: { refreshTokenHash: oldHash },
        include: { user: true },
      });
      if (
        !session ||
        session.revokedAt !== null ||
        session.expiresAt <= new Date() ||
        !session.user.isActive
      ) {
        throw new UnauthorizedError('Invalid refresh token');
      }

      const nextRawToken = generateOpaqueToken();
      const rotated = await prisma.userSession.updateMany({
        where: { id: session.id, refreshTokenHash: oldHash, revokedAt: null },
        data: {
          refreshTokenHash: hashToken(nextRawToken),
          lastUsedAt: new Date(),
        },
      });
      if (rotated.count !== 1) throw new UnauthorizedError('Invalid refresh token');

      const accessToken = await signAccessToken(session.userId, session.id);
      const tokens: SessionTokens = {
        accessToken,
        refreshToken: nextRawToken,
        expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
        tokenType: 'Bearer',
      };
      setRefreshCookie(reply, nextRawToken, session.expiresAt);
      return authResponse(session.user, tokens);
    }
  );

  app.post(
    '/logout',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Revoke the current refresh session',
        description:
          'Accepts the refresh token in the JSON body or in the HttpOnly hm_refresh cookie.',
      },
    },
    async (request, reply) => {
      const body = optionalRefreshBodySchema.parse(request.body) ?? {};
      const rawToken = readRefreshToken(request, body.refreshToken);
      if (rawToken) {
        const session = await prisma.userSession.findUnique({
          where: { refreshTokenHash: hashToken(rawToken) },
          include: { user: true },
        });
        if (session && session.revokedAt === null) {
          await prisma.$transaction(async (tx) => {
            await tx.userSession.update({
              where: { id: session.id },
              data: { revokedAt: new Date() },
            });
            await writeAuditLog(tx, request, {
              actorId: session.userId,
              actorType: session.user.role,
              actorEmail: session.user.email,
              action: AuditAction.USER_LOGGED_OUT,
              entityType: 'user_session',
              entityId: session.id,
            });
          });
        }
      }
      clearRefreshCookie(reply);
      return reply.status(204).send();
    }
  );

  app.post(
    '/logout-all',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Revoke all sessions for the current user',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      await prisma.$transaction(async (tx) => {
        await tx.userSession.updateMany({
          where: { userId: auth.user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await writeAuditLog(tx, request, {
          actorId: auth.user.id,
          actorType: auth.user.role,
          actorEmail: auth.user.email,
          action: AuditAction.SESSION_REVOKED,
          entityType: 'user',
          entityId: auth.user.id,
          metadata: { scope: 'all' },
        });
      });
      clearRefreshCookie(reply);
      return reply.status(204).send();
    }
  );

  app.post(
    '/password/forgot',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: {
        tags: ['Auth'],
        summary: 'Request a password reset token',
        body: apiSchema(forgotPasswordRequestSchema),
        response: { 202: apiSchema(forgotPasswordResponseSchema) },
      },
    },
    async (request, reply) => {
      const body = forgotPasswordRequestSchema.parse(request.body);
      const email = normalizeEmail(body.email);
      const user = await prisma.user.findUnique({ where: { email } });
      let devResetToken: string | undefined;

      if (user?.isActive) {
        devResetToken = generateOpaqueToken();
        await prisma.$transaction(async (tx) => {
          await tx.verificationToken.updateMany({
            where: { userId: user.id, type: PASSWORD_RESET, usedAt: null },
            data: { usedAt: new Date() },
          });
          await tx.verificationToken.create({
            data: {
              userId: user.id,
              token: hashToken(devResetToken!),
              type: PASSWORD_RESET,
              expiresAt: verificationExpiry('password_reset'),
            },
          });
          await writeAuditLog(tx, request, {
            actorId: user.id,
            actorType: user.role,
            actorEmail: user.email,
            action: AuditAction.PASSWORD_RESET_REQUESTED,
            entityType: 'user',
            entityId: user.id,
          });
        });
      }

      reply.status(202);
      return {
        message: 'If an account with that email exists, a password reset link has been sent.',
        ...(env.NODE_ENV !== 'production' && devResetToken ? { devResetToken } : {}),
      };
    }
  );

  app.post(
    '/password/reset',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      schema: {
        tags: ['Auth'],
        summary: 'Reset a password with a single-use token',
        body: apiSchema(resetPasswordRequestSchema),
        response: { 200: apiSchema(messageResponseSchema) },
      },
    },
    async (request, reply) => {
      const body = resetPasswordRequestSchema.parse(request.body);
      assertStrongPassword(body.password);

      const record = await prisma.verificationToken.findUnique({
        where: { token: hashToken(body.token) },
        include: { user: true },
      });
      if (
        !record ||
        record.type !== PASSWORD_RESET ||
        record.usedAt !== null ||
        record.expiresAt <= new Date()
      ) {
        throw new ValidationError('Invalid or expired reset token');
      }

      const passwordHash = await hashPassword(body.password);
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.verificationToken.updateMany({
          where: { id: record.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1) throw new ValidationError('Invalid or expired reset token');

        await tx.user.update({
          where: { id: record.userId },
          data: { passwordHash },
        });
        await tx.userSession.updateMany({
          where: { userId: record.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await writeAuditLog(tx, request, {
          actorId: record.userId,
          actorType: record.user.role,
          actorEmail: record.user.email,
          action: AuditAction.PASSWORD_CHANGED,
          entityType: 'user',
          entityId: record.userId,
          metadata: { reason: 'password_reset' },
          severity: 'warning',
        });
      });

      clearRefreshCookie(reply);
      return { message: 'Password reset successful. Please sign in again.' };
    }
  );

  app.post(
    '/password/change',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      schema: {
        tags: ['Auth'],
        summary: 'Change the current password',
        security: [{ bearerAuth: [] }],
        body: apiSchema(changePasswordRequestSchema),
        response: { 200: apiSchema(messageResponseSchema) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const body = changePasswordRequestSchema.parse(request.body);
      assertStrongPassword(body.newPassword);

      const currentMatches = await verifyPassword(body.currentPassword, auth.user.passwordHash);
      if (!currentMatches) throw new ValidationError('Current password is incorrect');
      if (body.currentPassword === body.newPassword) {
        throw new ValidationError('New password must be different from the current password');
      }

      const passwordHash = await hashPassword(body.newPassword);
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: auth.user.id }, data: { passwordHash } });
        await tx.userSession.updateMany({
          where: {
            userId: auth.user.id,
            revokedAt: null,
            id: { not: auth.sessionId },
          },
          data: { revokedAt: new Date() },
        });
        await writeAuditLog(tx, request, {
          actorId: auth.user.id,
          actorType: auth.user.role,
          actorEmail: auth.user.email,
          action: AuditAction.PASSWORD_CHANGED,
          entityType: 'user',
          entityId: auth.user.id,
          severity: 'warning',
        });
      });

      return { message: 'Password changed successfully. Other sessions have been signed out.' };
    }
  );

  app.post(
    '/email/verify',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      schema: {
        tags: ['Auth'],
        summary: 'Verify an email address with a single-use token',
        body: apiSchema(verifyEmailRequestSchema),
        response: { 200: apiSchema(verifyEmailResponseSchema) },
      },
    },
    async (request) => {
      const body = verifyEmailRequestSchema.parse(request.body);
      const record = await prisma.verificationToken.findUnique({
        where: { token: hashToken(body.token) },
        include: { user: true },
      });
      if (
        !record ||
        record.type !== EMAIL_VERIFICATION ||
        record.usedAt !== null ||
        record.expiresAt <= new Date()
      ) {
        throw new ValidationError('Invalid or expired verification token');
      }

      await prisma.$transaction(async (tx) => {
        const claimed = await tx.verificationToken.updateMany({
          where: { id: record.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1) {
          throw new ValidationError('Invalid or expired verification token');
        }
        await tx.user.update({
          where: { id: record.userId },
          data: { emailVerified: true },
        });
        await writeAuditLog(tx, request, {
          actorId: record.userId,
          actorType: record.user.role,
          actorEmail: record.user.email,
          action: AuditAction.EMAIL_VERIFIED,
          entityType: 'user',
          entityId: record.userId,
        });
      });

      return { message: 'Email verified successfully.', emailVerified: true as const };
    }
  );
}
