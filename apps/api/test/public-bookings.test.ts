import { addDays, getDatesInRange, parseDate, today } from '@hotel-marketplace/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { generateOpaqueToken, hashToken, signAccessToken } from '../src/auth/tokens.js';

import { resetDatabase, testPrisma } from './helpers/db.js';

const NGN_RATE = 4_500_000;

describe('public hotel search and booking', () => {
  let app: FastifyInstance;
  let hotelId: string;
  let categoryId: string;
  let ratePlanId: string;
  let checkIn: string;
  let checkOut: string;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase();
    const partner = await testPrisma.user.create({
      data: {
        email: 'search-partner@example.test',
        passwordHash: 'test-password-hash',
        firstName: 'Test',
        lastName: 'Partner',
        role: 'hotel_owner',
      },
    });
    const hotel = await testPrisma.hotel.create({
      data: {
        partnerId: partner.id,
        name: 'Search Test Hotel',
        slug: 'search-test-hotel',
        propertyType: 'hotel',
        addressLine1: '12 Test Road',
        city: 'Lagos',
        state: 'Lagos',
        status: 'approved',
        approvedAt: new Date(),
      },
    });
    const category = await testPrisma.roomCategory.create({
      data: {
        hotelId: hotel.id,
        name: 'Garden Room',
        slug: 'garden-room',
        maxAdults: 2,
        maxChildren: 1,
        inventoryMode: 'category_quantity',
        totalQuantity: 1,
        baseRateAmount: NGN_RATE,
      },
    });
    const ratePlan = await testPrisma.ratePlan.create({
      data: {
        hotelId: hotel.id,
        roomCategoryId: category.id,
        name: 'Flexible',
        type: 'refundable',
        baseRateAmount: NGN_RATE,
      },
    });
    const policy = await testPrisma.cancellationPolicy.create({
      data: {
        name: 'Flexible cancellation',
        template: 'flexible',
        description: 'Free cancellation up to 24 hours before arrival.',
        freeCancellationUntilHoursBeforeCheckIn: 24,
        isPlatformTemplate: true,
      },
    });
    await testPrisma.ratePlan.update({
      where: { id: ratePlan.id },
      data: { cancellationPolicyId: policy.id },
    });

    checkIn = addDays(today(), 15);
    checkOut = addDays(checkIn, 3);
    const inventoryDates = getDatesInRange({ checkIn, checkOut: addDays(checkOut, 1) });
    await testPrisma.inventoryDay.createMany({
      data: inventoryDates.map((date) => ({
        hotelId: hotel.id,
        roomCategoryId: category.id,
        date: parseDate(date),
        quantity: 1,
      })),
    });
    hotelId = hotel.id;
    categoryId = category.id;
    ratePlanId = ratePlan.id;
  });

  afterAll(async () => {
    await app.close();
  });

  function searchBody(overrides: Record<string, unknown> = {}) {
    return {
      destination: 'Lagos',
      checkIn,
      checkOut,
      adults: 2,
      children: 0,
      rooms: 1,
      ...overrides,
    };
  }

  async function createQuote() {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      payload: {
        hotelId,
        roomCategoryId: categoryId,
        ratePlanId,
        checkIn,
        checkOut,
        adults: 2,
        children: 0,
        rooms: 1,
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  function bookingBody(quoteId: string, idempotencyKey: string) {
    return {
      quoteId,
      idempotencyKey,
      guests: [
        {
          firstName: 'Ada',
          lastName: 'Okafor',
          email: 'ada@example.test',
          phone: '+2348012345678',
          isPrimary: true,
        },
      ],
      rooms: [
        {
          roomCategoryId: categoryId,
          ratePlanId,
          adults: 2,
          children: 0,
          quantity: 1,
        },
      ],
    };
  }

  it('searches approved inventory and returns date-based room totals', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hotels/search',
      payload: searchBody(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [
        {
          hotelId,
          hotelName: 'Search Test Hotel',
          minPrice: { amount: NGN_RATE * 3, currency: 'NGN' },
          availableRoomCategories: [
            {
              id: categoryId,
              availableQuantity: 1,
              ratePlans: [{ id: ratePlanId, price: { amount: NGN_RATE * 3, currency: 'NGN' } }],
            },
          ],
        },
      ],
      pagination: { total: 1 },
    });
  });

  it('rejects invalid calendar dates and guest capacities', async () => {
    const invalidDate = await app.inject({
      method: 'POST',
      url: '/api/v1/hotels/search',
      payload: searchBody({ checkIn: '2030-02-31' }),
    });
    expect(invalidDate.statusCode).toBe(422);

    const overCapacity = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      payload: {
        hotelId,
        roomCategoryId: categoryId,
        ratePlanId,
        checkIn,
        checkOut,
        adults: 3,
        children: 0,
      },
    });
    expect(overCapacity.statusCode).toBe(422);
  });

  it('only searches approved hotel listings', async () => {
    await testPrisma.hotel.update({ where: { id: hotelId }, data: { status: 'draft' } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hotels/search',
      payload: searchBody(),
    });
    expect(response.json().data).toEqual([]);
  });

  it('creates a pending booking once and replays idempotent retries', async () => {
    const quote = await createQuote();
    const payload = bookingBody(quote.quoteId, 'test-booking-idempotency-key');
    const first = await app.inject({ method: 'POST', url: '/api/v1/bookings', payload });
    const retry = await app.inject({ method: 'POST', url: '/api/v1/bookings', payload });

    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(201);
    expect(retry.json().id).toBe(first.json().id);
    expect(first.json()).toMatchObject({
      status: 'pending_payment',
      pricingSnapshot: { total: { amount: NGN_RATE * 3, currency: 'NGN' } },
      paymentId: null,
    });
    expect(await testPrisma.booking.count()).toBe(1);
    expect(await testPrisma.inventoryHold.count({ where: { status: 'active' } })).toBe(1);

    const reusedKey = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      payload: {
        ...payload,
        guests: [{ ...payload.guests[0], email: 'different@example.test' }],
      },
    });
    expect(reusedKey.statusCode).toBe(409);

    const noInventory = await app.inject({
      method: 'POST',
      url: '/api/v1/hotels/search',
      payload: searchBody(),
    });
    expect(noInventory.json().data).toEqual([]);
  });

  it('does not oversell the last room when two bookings race', async () => {
    const [firstQuote, secondQuote] = await Promise.all([createQuote(), createQuote()]);
    const [firstBooking, secondBooking] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        payload: bookingBody(firstQuote.quoteId, 'parallel-booking-key-one'),
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        payload: bookingBody(secondQuote.quoteId, 'parallel-booking-key-two'),
      }),
    ]);

    expect([firstBooking.statusCode, secondBooking.statusCode].sort()).toEqual([201, 409]);
    expect(await testPrisma.booking.count()).toBe(1);
    expect(await testPrisma.inventoryHold.count({ where: { status: 'active' } })).toBe(1);
  });

  it('associates a signed-in customer with their pending booking', async () => {
    const customer = await testPrisma.user.create({
      data: {
        email: 'booking-customer@example.test',
        passwordHash: 'test-password-hash',
        firstName: 'Ada',
        lastName: 'Okafor',
        role: 'customer',
      },
    });
    const session = await testPrisma.userSession.create({
      data: {
        userId: customer.id,
        refreshTokenHash: hashToken(generateOpaqueToken()),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const token = await signAccessToken(customer.id, session.id);
    const quote = await createQuote();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      headers: { authorization: `Bearer ${token}` },
      payload: bookingBody(quote.quoteId, 'signed-in-booking-key'),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().customerId).toBe(customer.id);
  });

  it('uses physical-room maintenance blocks when that inventory mode is configured', async () => {
    await testPrisma.roomCategory.update({
      where: { id: categoryId },
      data: { inventoryMode: 'physical_rooms' },
    });
    const physicalRoom = await testPrisma.physicalRoom.create({
      data: {
        hotelId,
        roomCategoryId: categoryId,
        roomNumber: '101',
      },
    });
    const maintenance = await testPrisma.maintenanceBlock.create({
      data: {
        hotelId,
        roomCategoryId: categoryId,
        physicalRoomId: physicalRoom.id,
        startDate: parseDate(checkIn),
        endDate: parseDate(checkOut),
        reason: 'Scheduled maintenance',
      },
    });

    const unavailable = await app.inject({
      method: 'POST',
      url: '/api/v1/hotels/search',
      payload: searchBody(),
    });
    expect(unavailable.json().data).toEqual([]);

    await testPrisma.maintenanceBlock.delete({ where: { id: maintenance.id } });
    const available = await app.inject({
      method: 'POST',
      url: '/api/v1/hotels/search',
      payload: searchBody(),
    });
    expect(available.json().data).toHaveLength(1);
  });

  it('rejects an expired quote and a quote whose server price changed', async () => {
    const expiredQuote = await createQuote();
    await testPrisma.quote.update({
      where: { id: expiredQuote.quoteId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expiredBooking = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      payload: bookingBody(expiredQuote.quoteId, 'expired-quote-key'),
    });
    expect(expiredBooking.statusCode).toBe(409);

    const staleQuote = await createQuote();
    await testPrisma.ratePlan.update({
      where: { id: ratePlanId },
      data: { baseRateAmount: NGN_RATE + 100_000 },
    });
    const staleBooking = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      payload: bookingBody(staleQuote.quoteId, 'stale-quote-key'),
    });
    expect(staleBooking.statusCode).toBe(409);
    expect(staleBooking.json().error.code).toBe('QUOTE_STALE');
  });

  it('expires stale pending holds before reporting availability', async () => {
    const quote = await createQuote();
    const bookingResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      payload: bookingBody(quote.quoteId, 'hold-expiry-key'),
    });
    expect(bookingResponse.statusCode).toBe(201);
    await testPrisma.booking.update({
      where: { id: bookingResponse.json().id },
      data: { holdExpiresAt: new Date(Date.now() - 1000) },
    });
    await testPrisma.inventoryHold.updateMany({
      where: { bookingId: bookingResponse.json().id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const availableAgain = await app.inject({
      method: 'POST',
      url: '/api/v1/hotels/search',
      payload: searchBody(),
    });
    expect(availableAgain.json().data).toHaveLength(1);
    expect(
      await testPrisma.booking.findUnique({ where: { id: bookingResponse.json().id } })
    ).toMatchObject({ status: 'expired' });
  });
});
