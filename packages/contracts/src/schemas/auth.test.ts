import { describe, expect, it } from 'vitest';

import {
  inviteStaffRequestSchema,
  partnerRegisterRequestSchema,
  registerRequestSchema,
  tokenPairSchema,
  updateProfileRequestSchema,
} from './auth';

describe('authentication contracts', () => {
  it('accepts a valid customer registration', () => {
    const result = registerRequestSchema.parse({
      email: 'ada@example.test',
      password: 'StrongPass123',
      firstName: 'Ada',
      lastName: 'Okafor',
      phone: '+2348012345678',
      acceptTerms: true,
    });
    expect(result.email).toBe('ada@example.test');
  });

  it('requires explicit terms acceptance', () => {
    expect(() =>
      registerRequestSchema.parse({
        email: 'ada@example.test',
        password: 'StrongPass123',
        firstName: 'Ada',
        lastName: 'Okafor',
        acceptTerms: false,
      })
    ).toThrow();
  });

  it('requires at least one profile field but allows partial updates', () => {
    expect(() => updateProfileRequestSchema.parse({})).toThrow();
    expect(updateProfileRequestSchema.parse({ city: 'Abuja' })).toEqual({ city: 'Abuja' });
    expect(
      updateProfileRequestSchema.parse({
        dateOfBirth: '1990-05-12',
        marketingOptIn: true,
      })
    ).toEqual({ dateOfBirth: '1990-05-12', marketingOptIn: true });
  });

  it('validates partner registration and staff roles', () => {
    expect(
      partnerRegisterRequestSchema.parse({
        email: 'partner@example.test',
        password: 'StrongPass123',
        firstName: 'Chidi',
        lastName: 'Balogun',
        phone: '+2348098765432',
        companyName: 'Balogun Hospitality Group',
        acceptTerms: true,
      }).companyName
    ).toBe('Balogun Hospitality Group');

    expect(() =>
      inviteStaffRequestSchema.parse({
        email: 'staff@example.test',
        role: 'owner',
        hotelId: '11111111-1111-4111-8111-111111111111',
      })
    ).toThrow();
  });

  it('validates token pairs', () => {
    expect(
      tokenPairSchema.parse({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: 900,
        tokenType: 'Bearer',
      }).expiresIn
    ).toBe(900);
    expect(() =>
      tokenPairSchema.parse({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: 0,
        tokenType: 'Bearer',
      })
    ).toThrow();
  });
});
