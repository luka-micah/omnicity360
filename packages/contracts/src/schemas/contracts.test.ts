import { describe, expect, it } from 'vitest';

import { bookingCreateRequestSchema, quoteRequestSchema } from './booking';
import { dateRangeSchema, httpUrlSchema, moneySchema, paginationParamsSchema } from './common';
import {
  hotelCreateRequestSchema,
  hotelMediaCreateRequestSchema,
  hotelMediaUpdateRequestSchema,
  hotelUpdateRequestSchema,
} from './hotel';
import { paymentInitializeRequestSchema } from './payment';

const validGuest = {
  firstName: 'Ada',
  lastName: 'Okafor',
  email: 'ada@example.test',
  phone: '+2348012345678',
  isPrimary: true,
};

describe('money schema', () => {
  it('accepts integer minor units with a supported currency', () => {
    expect(moneySchema.parse({ amount: 4500000, currency: 'NGN' })).toEqual({
      amount: 4500000,
      currency: 'NGN',
    });
  });

  it('rejects decimal minor units', () => {
    expect(() => moneySchema.parse({ amount: 10.5, currency: 'NGN' })).toThrow();
  });

  it('rejects negative amounts', () => {
    expect(() => moneySchema.parse({ amount: -1, currency: 'NGN' })).toThrow();
  });

  it('rejects unsupported currencies', () => {
    expect(() => moneySchema.parse({ amount: 100, currency: 'XYZ' })).toThrow();
  });
});

describe('pagination schema', () => {
  it('applies default page and limit', () => {
    expect(paginationParamsSchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('coerces query strings and caps the limit', () => {
    expect(paginationParamsSchema.parse({ page: '2', limit: '50' })).toEqual({
      page: 2,
      limit: 50,
    });
    expect(() => paginationParamsSchema.parse({ limit: '101' })).toThrow();
    expect(() => paginationParamsSchema.parse({ page: '0' })).toThrow();
  });
});

describe('date range schema', () => {
  it('accepts check-out after check-in', () => {
    expect(dateRangeSchema.parse({ checkIn: '2026-12-10', checkOut: '2026-12-13' })).toEqual({
      checkIn: '2026-12-10',
      checkOut: '2026-12-13',
    });
  });

  it('rejects equal or inverted dates', () => {
    expect(() =>
      dateRangeSchema.parse({ checkIn: '2026-12-10', checkOut: '2026-12-10' })
    ).toThrow();
    expect(() =>
      dateRangeSchema.parse({ checkIn: '2026-12-13', checkOut: '2026-12-10' })
    ).toThrow();
  });

  it('rejects malformed dates', () => {
    expect(() =>
      dateRangeSchema.parse({ checkIn: '10/12/2026', checkOut: '2026-12-13' })
    ).toThrow();
  });
});

describe('hotel schema', () => {
  it('accepts a minimal valid hotel and applies defaults', () => {
    const parsed = hotelCreateRequestSchema.parse({
      name: 'Lekki Palm Hotel',
      propertyType: 'hotel',
      address: { line1: '12 Admiralty Way', city: 'Lekki', state: 'Lagos' },
      contact: { email: 'stay@example.test' },
    });
    expect(parsed.checkInTime).toBe('14:00');
    expect(parsed.checkOutTime).toBe('11:00');
    expect(parsed.amenities).toEqual([]);
  });

  it('rejects invalid time formats', () => {
    expect(() =>
      hotelCreateRequestSchema.parse({
        name: 'Bad Times Hotel',
        propertyType: 'hotel',
        address: { line1: '1 Road', city: 'Lagos', state: 'Lagos' },
        contact: {},
        checkInTime: '25:00',
      })
    ).toThrow();
  });
});

describe('hotel management schemas', () => {
  it('rejects malformed slugs but accepts generated-style slugs', () => {
    const base = {
      name: 'Test Hotel',
      propertyType: 'hotel',
      address: { line1: '1 Road', city: 'Lagos', state: 'Lagos' },
      contact: {},
    };
    expect(() => hotelCreateRequestSchema.parse({ ...base, slug: 'Not A Slug' })).toThrow();
    expect(() => hotelCreateRequestSchema.parse({ ...base, slug: 'bad--slug' })).toThrow();
    expect(() => hotelCreateRequestSchema.parse({ ...base, slug: 'trailing-' })).toThrow();
    expect(hotelCreateRequestSchema.parse({ ...base, slug: 'good-slug-2' }).slug).toBe(
      'good-slug-2'
    );
  });

  it('never fills absent PATCH fields with defaults', () => {
    expect(hotelUpdateRequestSchema.parse({})).toEqual({});

    const addressOnly = hotelUpdateRequestSchema.parse({ address: { city: 'Abuja' } });
    expect(addressOnly).toEqual({ address: { city: 'Abuja' } });

    const mediaOnly = hotelMediaUpdateRequestSchema.parse({ caption: 'Lobby' });
    expect(mediaOnly).toEqual({ caption: 'Lobby' });
  });

  it('requires at least one field in a media patch', () => {
    expect(() => hotelMediaUpdateRequestSchema.parse({})).toThrow();
    expect(
      hotelMediaCreateRequestSchema.parse({ url: 'https://images.example.test/a.jpg' })
    ).toEqual({
      url: 'https://images.example.test/a.jpg',
      sortOrder: 0,
    });
  });

  it('restricts external links to http(s)', () => {
    expect(httpUrlSchema.parse('https://images.example.test/a.jpg')).toBe(
      'https://images.example.test/a.jpg'
    );
    expect(() => httpUrlSchema.parse('javascript:alert(1)')).toThrow();
    expect(() => httpUrlSchema.parse('data:text/html,<script></script>')).toThrow();
  });
});

describe('quote request schema', () => {
  it('rejects an inverted stay', () => {
    expect(() =>
      quoteRequestSchema.parse({
        hotelId: '0b6a4f2e-6a41-4a3e-9aa2-2f1a4b7c8d90',
        roomCategoryId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        checkIn: '2026-12-13',
        checkOut: '2026-12-10',
        adults: 2,
        children: 0,
      })
    ).toThrow();
  });

  it('accepts a valid quote request', () => {
    const parsed = quoteRequestSchema.parse({
      hotelId: '0b6a4f2e-6a41-4a3e-9aa2-2f1a4b7c8d90',
      roomCategoryId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      checkIn: '2026-12-10',
      checkOut: '2026-12-13',
      adults: 2,
      children: 0,
    });
    expect(parsed.rooms).toBe(1);
  });
});

describe('booking creation schema', () => {
  const base = {
    quoteId: '3f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
    idempotencyKey: 'idem-123',
    rooms: [
      {
        roomCategoryId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        ratePlanId: 'b3d1c2e4-5f60-4a7b-8c9d-0e1f2a3b4c5d',
        adults: 2,
        children: 0,
        quantity: 1,
      },
    ],
    guests: [validGuest],
  };

  it('accepts a single primary guest for multiple adults (occupants are validated by the service)', () => {
    expect(() => bookingCreateRequestSchema.parse(base)).not.toThrow();
  });

  it('requires at least one guest', () => {
    const parsed = bookingCreateRequestSchema.safeParse({ ...base, guests: [] });
    expect(parsed.success).toBe(false);
  });

  it('rejects more than ten guests', () => {
    const parsed = bookingCreateRequestSchema.safeParse({
      ...base,
      guests: Array.from({ length: 11 }, () => validGuest),
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an invalid idempotency key', () => {
    expect(() => bookingCreateRequestSchema.parse({ ...base, idempotencyKey: '' })).toThrow();
  });

  it('does not accept client-controlled payment method fields', () => {
    expect(() =>
      bookingCreateRequestSchema.parse({ ...base, paymentMethodId: 'client-controlled' })
    ).toThrow();
  });
});

describe('payment initialize schema', () => {
  it('requires a valid redirect URL and amount', () => {
    const base = {
      bookingId: '3f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
      amount: { amount: 4500000, currency: 'NGN' },
      currency: 'NGN',
      customerEmail: 'ada@example.test',
      customerPhone: '+2348012345678',
      customerName: 'Ada Okafor',
      redirectUrl: 'https://example.test/payment/return',
      idempotencyKey: 'idem-123',
    };
    expect(() => paymentInitializeRequestSchema.parse(base)).not.toThrow();
    expect(() =>
      paymentInitializeRequestSchema.parse({ ...base, redirectUrl: 'not-a-url' })
    ).toThrow();
  });
});
