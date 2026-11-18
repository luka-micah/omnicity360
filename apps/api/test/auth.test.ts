import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

import { resetDatabase, testPrisma } from './helpers/db.js';

const PASSWORD = 'StrongPass123';

function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID()}@example.test`;
}

function cookieHeader(response: { headers: Record<string, unknown> }): string {
  const value = response.headers['set-cookie'];
  return Array.isArray(value) ? value.join('; ') : String(value ?? '');
}

async function register(
  app: FastifyInstance,
  email = uniqueEmail('customer'),
  password = PASSWORD
) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password,
      firstName: 'Ada',
      lastName: 'Okafor',
      phone: '+2348012345678',
      acceptTerms: true,
    },
  });
}

function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

describe('authentication and sessions', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a customer, normalizes email, and sets a secure cookie', async () => {
    const email = `New.User.${randomUUID()}@Example.Test`;
    const response = await register(app, email);
    expect(response.statusCode).toBe(201);

    const body = response.json();
    expect(body.user).toMatchObject({
      email: email.toLowerCase(),
      role: 'customer',
      emailVerified: false,
      firstName: 'Ada',
      lastName: 'Okafor',
    });
    expect(body.tokens.tokenType).toBe('Bearer');
    expect(body.tokens.accessToken).toEqual(expect.any(String));
    expect(body.tokens.refreshToken).toEqual(expect.any(String));
    expect(body.tokens.expiresIn).toBeGreaterThan(0);
    expect(body.devEmailVerificationToken).toEqual(expect.any(String));

    const setCookie = cookieHeader(response);
    expect(setCookie).toContain('hm_refresh=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/api/v1/auth');

    const stored = await testPrisma.user.findUniqueOrThrow({
      where: { email: email.toLowerCase() },
      include: { customerProfile: true, verificationTokens: true },
    });
    expect(stored.passwordHash).not.toBe(PASSWORD);
    expect(stored.customerProfile).not.toBeNull();
    expect(stored.verificationTokens).toHaveLength(1);
    expect(stored.verificationTokens[0].token).not.toBe(body.devEmailVerificationToken);

    const audit = await testPrisma.auditLog.findFirst({ where: { action: 'user_registered' } });
    expect(audit?.actorId).toBe(stored.id);

    const profile = await app.inject({
      method: 'GET',
      url: '/api/v1/me/profile',
      headers: bearer(body.tokens.accessToken),
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().user.email).toBe(email.toLowerCase());
  });

  it('rejects duplicate registration and weak passwords', async () => {
    const email = uniqueEmail('duplicate');
    expect((await register(app, email)).statusCode).toBe(201);
    const duplicate = await register(app, email);
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('EMAIL_ALREADY_REGISTERED');

    const weak = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: uniqueEmail('weak'),
        password: 'lowercase1',
        firstName: 'Ada',
        lastName: 'Okafor',
        acceptTerms: true,
      },
    });
    expect(weak.statusCode).toBe(422);
    expect(weak.json().error.code).toBe('VALIDATION_ERROR');
    expect(weak.json().error.details.reasons.length).toBeGreaterThan(0);
  });

  it('uses generic responses for unknown accounts and wrong passwords', async () => {
    const email = uniqueEmail('enumeration');
    await register(app, email);

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'WrongPass123' },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: uniqueEmail('missing'), password: 'WrongPass123' },
    });

    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().error).toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Invalid email or password',
    });
    expect(unknown.json().error).toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Invalid email or password',
    });
  });

  it('logs in, rotates refresh tokens, and rejects reuse', async () => {
    const email = uniqueEmail('refresh');
    const registration = await register(app, email);
    const registrationBody = registration.json();

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD, rememberMe: true },
    });
    expect(login.statusCode).toBe(200);
    const loginBody = login.json();

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: loginBody.tokens.refreshToken },
    });
    expect(refresh.statusCode).toBe(200);
    const refreshed = refresh.json();
    expect(refreshed.tokens.refreshToken).not.toBe(loginBody.tokens.refreshToken);
    expect(refreshed.tokens.accessToken).not.toBe(loginBody.tokens.accessToken);

    const reused = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: loginBody.tokens.refreshToken },
    });
    expect(reused.statusCode).toBe(401);

    const cookieRefresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: `hm_refresh=${refreshed.tokens.refreshToken}` },
    });
    expect(cookieRefresh.statusCode, cookieRefresh.body).toBe(200);

    const sessions = await testPrisma.userSession.findMany({
      where: { userId: registrationBody.user.id },
    });
    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.refreshTokenHash.length === 64)).toBe(true);
  });

  it('revokes the session on logout and rejects the access token immediately', async () => {
    const registration = await register(app, uniqueEmail('logout'));
    const body = registration.json();

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: body.tokens.refreshToken },
    });
    expect(logout.statusCode).toBe(204);
    expect(cookieHeader(logout)).toContain('hm_refresh=;');

    const profile = await app.inject({
      method: 'GET',
      url: '/api/v1/me/profile',
      headers: bearer(body.tokens.accessToken),
    });
    expect(profile.statusCode).toBe(401);

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: body.tokens.refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
  });

  it('resets a password with a single-use token and revokes old sessions', async () => {
    const email = uniqueEmail('reset');
    const registration = await register(app, email);
    const original = registration.json();

    const forgot = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/forgot',
      payload: { email },
    });
    expect(forgot.statusCode).toBe(202);
    const resetToken = forgot.json().devResetToken;
    expect(resetToken).toEqual(expect.any(String));

    const unknown = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/forgot',
      payload: { email: uniqueEmail('unknown') },
    });
    expect(unknown.statusCode).toBe(202);
    expect(unknown.json().devResetToken).toBeUndefined();

    const reset = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/reset',
      payload: { token: resetToken, password: 'NewStrongPass456' },
    });
    expect(reset.statusCode).toBe(200);

    const oldAccess = await app.inject({
      method: 'GET',
      url: '/api/v1/me/profile',
      headers: bearer(original.tokens.accessToken),
    });
    expect(oldAccess.statusCode).toBe(401);

    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'NewStrongPass456' },
    });
    expect(newLogin.statusCode).toBe(200);

    const reuse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/reset',
      payload: { token: resetToken, password: 'AnotherPass789' },
    });
    expect(reuse.statusCode).toBe(422);
  });

  it('verifies an email once', async () => {
    const registration = await register(app, uniqueEmail('verify'));
    const body = registration.json();

    const verify = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/email/verify',
      payload: { token: body.devEmailVerificationToken },
    });
    expect(verify.statusCode).toBe(200);
    expect(verify.json()).toEqual({
      message: 'Email verified successfully.',
      emailVerified: true,
    });

    const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: body.user.id } });
    expect(stored.emailVerified).toBe(true);

    const reuse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/email/verify',
      payload: { token: body.devEmailVerificationToken },
    });
    expect(reuse.statusCode).toBe(422);
  });

  it('updates the current profile', async () => {
    const registration = await register(app, uniqueEmail('profile'));
    const body = registration.json();

    const unauthorized = await app.inject({ method: 'GET', url: '/api/v1/me/profile' });
    expect(unauthorized.statusCode).toBe(401);

    const empty = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/profile',
      headers: bearer(body.tokens.accessToken),
      payload: {},
    });
    expect(empty.statusCode, empty.body).toBe(422);

    const update = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/profile',
      headers: bearer(body.tokens.accessToken),
      payload: {
        firstName: 'Ngozi',
        phone: '+2348099999999',
        city: 'Abuja',
        state: 'FCT',
        dateOfBirth: '1990-05-12',
        marketingOptIn: true,
      },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().user.firstName).toBe('Ngozi');
    expect(update.json().customerProfile).toMatchObject({
      city: 'Abuja',
      state: 'FCT',
      dateOfBirth: '1990-05-12',
      marketingOptIn: true,
    });
  });

  it('lists sessions and revokes a specific session', async () => {
    const email = uniqueEmail('sessions');
    const registration = await register(app, email);
    const registrationBody = registration.json();

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    const loginBody = login.json();

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/me/sessions',
      headers: bearer(loginBody.tokens.accessToken),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(2);
    expect(
      list.json().data.filter((session: { current: boolean }) => session.current)
    ).toHaveLength(1);

    const otherSession = list.json().data.find((session: { current: boolean }) => !session.current);
    const revoke = await app.inject({
      method: 'DELETE',
      url: `/api/v1/me/sessions/${otherSession.id}`,
      headers: bearer(loginBody.tokens.accessToken),
    });
    expect(revoke.statusCode).toBe(204);

    const oldRefresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: registrationBody.tokens.refreshToken },
    });
    expect(oldRefresh.statusCode).toBe(401);

    const logoutAll = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      headers: bearer(loginBody.tokens.accessToken),
    });
    expect(logoutAll.statusCode).toBe(204);
    const afterLogoutAll = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: loginBody.tokens.refreshToken },
    });
    expect(afterLogoutAll.statusCode).toBe(401);
  });

  it('registers a hotel partner with a company profile', async () => {
    const email = uniqueEmail('partner');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/partner/register',
      payload: {
        email,
        password: PASSWORD,
        firstName: 'Chidi',
        lastName: 'Balogun',
        phone: '+2348098765432',
        companyName: 'Balogun Hospitality Group',
        companyRegistrationNumber: 'RC-9999999',
        acceptTerms: true,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().user.role).toBe('hotel_owner');

    const stored = await testPrisma.user.findUniqueOrThrow({
      where: { email },
      include: { partnerProfile: true },
    });
    expect(stored.partnerProfile?.companyName).toBe('Balogun Hospitality Group');
  });

  it('rejects invalid access tokens', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me/profile',
      headers: bearer('not-a-jwt'),
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('rate-limits password reset requests', async () => {
    const limitedApp = await buildApp({ logger: false });
    await limitedApp.ready();
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const response = await limitedApp.inject({
          method: 'POST',
          url: '/api/v1/auth/password/forgot',
          payload: { email: uniqueEmail(`rate-${i}`) },
        });
        statuses.push(response.statusCode);
      }
      expect(statuses.slice(0, 5)).toEqual([202, 202, 202, 202, 202]);
      expect(statuses[5]).toBe(429);
    } finally {
      await limitedApp.close();
    }
  });
});
