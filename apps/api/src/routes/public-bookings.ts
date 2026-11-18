import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  availabilitySearchRequestSchema,
  availabilitySearchResponseSchema,
  bookingCreateRequestSchema,
  bookingResponseSchema,
  quoteRequestSchema,
  quoteResponseSchema,
} from '@hotel-marketplace/contracts';
import {
  basisPoints,
  calculateCommission,
  calculateNights,
  formatDate,
  formatDateTime,
  getDatesInRange,
  isoDate,
  parseDate,
  today,
  validateBookingDateRange,
} from '@hotel-marketplace/domain';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { authenticate } from '../auth/guard.js';
import { prisma } from '../db/prisma.js';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '../errors/index.js';
import { apiSchema } from '../openapi/schema.js';

const HOLD_MINUTES = 15;
const IDEMPOTENCY_HOURS = 24;
const NGN = 'NGN';

function hotelAvailabilityInclude(checkIn: Date, checkOut: Date) {
  return {
    images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    roomCategories: {
      where: { isActive: true },
      include: {
        inventoryDays: { where: { date: { gte: checkIn, lte: checkOut } } },
        ratePlans: {
          where: { isActive: true },
          include: {
            nightlyRates: { where: { date: { gte: checkIn, lte: checkOut } } },
          },
        },
        physicalRooms: {
          where: { status: 'available' },
          include: {
            maintenanceBlocks: {
              where: { startDate: { lt: checkOut }, endDate: { gt: checkIn } },
              select: { startDate: true, endDate: true },
            },
          },
        },
      },
    },
  } satisfies Prisma.HotelInclude;
}

type HotelWithAvailability = Prisma.HotelGetPayload<{
  include: ReturnType<typeof hotelAvailabilityInclude>;
}>;
type CategoryWithAvailability = HotelWithAvailability['roomCategories'][number];
type RatePlanWithAvailability = CategoryWithAvailability['ratePlans'][number];

interface StayRange {
  checkIn: ReturnType<typeof isoDate>;
  checkOut: ReturnType<typeof isoDate>;
  nights: number;
  checkInDate: Date;
  checkOutDate: Date;
  nightDates: ReturnType<typeof isoDate>[];
}

interface Occupancy {
  bookings: Map<string, Map<string, number>>;
  holds: Map<string, Map<string, number>>;
}

function stayRange(checkIn: string, checkOut: string): StayRange {
  let validCheckIn: ReturnType<typeof isoDate>;
  let validCheckOut: ReturnType<typeof isoDate>;
  let parsedCheckIn: Date;
  let parsedCheckOut: Date;
  try {
    validCheckIn = isoDate(checkIn);
    validCheckOut = isoDate(checkOut);
    parsedCheckIn = parseDate(validCheckIn);
    parsedCheckOut = parseDate(validCheckOut);
    if (formatDate(parsedCheckIn) !== checkIn || formatDate(parsedCheckOut) !== checkOut) {
      throw new Error('Dates must be valid calendar dates');
    }
    validateBookingDateRange({ checkIn: validCheckIn, checkOut: validCheckOut }, 365);
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : 'Invalid stay dates');
  }

  return {
    checkIn: validCheckIn,
    checkOut: validCheckOut,
    nights: calculateNights(validCheckIn, validCheckOut),
    checkInDate: parsedCheckIn,
    checkOutDate: parsedCheckOut,
    nightDates: getDatesInRange({ checkIn: validCheckIn, checkOut: validCheckOut }),
  };
}

async function loadOccupancy(
  db: Pick<Prisma.TransactionClient, 'booking' | 'inventoryHold' | 'quote'>,
  hotels: HotelWithAvailability[],
  range: StayRange,
  now: Date
): Promise<Occupancy> {
  const categoryIds = hotels.flatMap((hotel) =>
    hotel.roomCategories.map((category) => category.id)
  );
  if (categoryIds.length === 0) return { bookings: new Map(), holds: new Map() };

  await expirePendingBookings(db, now);
  const [bookings, holds] = await Promise.all([
    db.booking.findMany({
      where: {
        roomCategoryId: { in: categoryIds },
        checkIn: { lt: range.checkOutDate },
        checkOut: { gt: range.checkInDate },
        status: { in: ['confirmed', 'checked_in', 'cancellation_requested'] },
      },
      select: { roomCategoryId: true, rooms: true, checkIn: true, checkOut: true },
    }),
    db.inventoryHold.findMany({
      where: {
        roomCategoryId: { in: categoryIds },
        checkIn: { lt: range.checkOutDate },
        checkOut: { gt: range.checkInDate },
        status: 'active',
        expiresAt: { gt: now },
      },
      select: { roomCategoryId: true, quantity: true, checkIn: true, checkOut: true },
    }),
  ]);
  const bookingCounts = new Map<string, Map<string, number>>();
  const holdCounts = new Map<string, Map<string, number>>();
  for (const booking of bookings) {
    addOccupancy(
      bookingCounts,
      booking.roomCategoryId,
      booking.checkIn,
      booking.checkOut,
      booking.rooms,
      range
    );
  }
  for (const hold of holds) {
    addOccupancy(
      holdCounts,
      hold.roomCategoryId,
      hold.checkIn,
      hold.checkOut,
      hold.quantity,
      range
    );
  }
  return { bookings: bookingCounts, holds: holdCounts };
}

function addOccupancy(
  counts: Map<string, Map<string, number>>,
  categoryId: string,
  checkIn: Date,
  checkOut: Date,
  quantity: number,
  range: StayRange
): void {
  const dates = counts.get(categoryId) ?? new Map<string, number>();
  const bookingCheckIn = formatDate(checkIn);
  const bookingCheckOut = formatDate(checkOut);
  for (const date of range.nightDates) {
    if (date >= bookingCheckIn && date < bookingCheckOut) {
      dates.set(date, (dates.get(date) ?? 0) + quantity);
    }
  }
  counts.set(categoryId, dates);
}

async function expirePendingBookings(
  db: Pick<Prisma.TransactionClient, 'booking' | 'inventoryHold' | 'quote'>,
  now: Date
): Promise<void> {
  await Promise.all([
    db.booking.updateMany({
      where: { status: 'pending_payment', holdExpiresAt: { lte: now } },
      data: { status: 'expired', expiredAt: now },
    }),
    db.inventoryHold.updateMany({
      where: { status: 'active', expiresAt: { lte: now } },
      data: { status: 'released', releasedAt: now },
    }),
    db.quote.deleteMany({ where: { expiresAt: { lte: now } } }),
  ]);
}

function availableQuantity(
  category: CategoryWithAvailability,
  range: StayRange,
  occupancy: Occupancy
): number {
  if (category.inventoryMode === 'physical_rooms') {
    const availabilityByNight = range.nightDates.map((date) => {
      const maintained = category.physicalRooms.filter((room) =>
        room.maintenanceBlocks.some(
          (block) => formatDate(block.startDate) <= date && formatDate(block.endDate) > date
        )
      ).length;
      const booked = occupancy.bookings.get(category.id)?.get(date) ?? 0;
      const held = occupancy.holds.get(category.id)?.get(date) ?? 0;
      return category.physicalRooms.length - maintained - booked - held;
    });
    return Math.max(0, Math.min(...availabilityByNight));
  }

  const inventoryByDate = new Map(category.inventoryDays.map((day) => [formatDate(day.date), day]));
  const quantities = range.nightDates.map((date) => {
    const quantity = inventoryByDate.get(date)?.quantity;
    if (quantity === undefined) return 0;
    const booked = occupancy.bookings.get(category.id)?.get(date) ?? 0;
    const held = occupancy.holds.get(category.id)?.get(date) ?? 0;
    return quantity - booked - held;
  });
  return Math.max(0, Math.min(...quantities));
}

interface PricedPlan {
  plan: RatePlanWithAvailability;
  nightlyRates: Array<{ date: string; rate: number }>;
  subtotal: number;
  currency: string;
}

function pricePlan(
  category: CategoryWithAvailability,
  plan: RatePlanWithAvailability,
  range: StayRange
): PricedPlan | null {
  const checkIn = range.checkIn;
  const checkOut = range.checkOut;
  const inventoryByDate = new Map(category.inventoryDays.map((day) => [formatDate(day.date), day]));
  const nightlyRatesByDate = new Map(
    plan.nightlyRates.map((rate) => [formatDate(rate.date), rate])
  );
  const closedToArrival = plan.closedToArrival.map(formatDate);
  const closedToDeparture = plan.closedToDeparture.map(formatDate);
  const inventoryCheckIn = inventoryByDate.get(checkIn);
  const inventoryCheckOut = inventoryByDate.get(checkOut);
  const rateCheckIn = nightlyRatesByDate.get(checkIn);
  const rateCheckOut = nightlyRatesByDate.get(checkOut);
  const daysUntilCheckIn = calculateNights(today(), checkIn);

  if (
    closedToArrival.includes(checkIn) ||
    closedToDeparture.includes(checkOut) ||
    inventoryCheckIn?.closedToArrival ||
    inventoryCheckOut?.closedToDeparture ||
    rateCheckIn?.closedToArrival ||
    rateCheckOut?.closedToDeparture ||
    (plan.advancePurchaseDays !== null && daysUntilCheckIn < plan.advancePurchaseDays)
  ) {
    return null;
  }
  if (
    range.nights < plan.minStayNights ||
    (plan.maxStayNights && range.nights > plan.maxStayNights)
  ) {
    return null;
  }

  const nightlyRates: PricedPlan['nightlyRates'] = [];
  let subtotal = 0;
  for (const date of range.nightDates) {
    const inventory = inventoryByDate.get(date);
    const nightly = nightlyRatesByDate.get(date);
    if (inventory?.stopSell || nightly?.stopSell) return null;
    if (inventory?.minStay && range.nights < inventory.minStay) return null;
    if (inventory?.maxStay && range.nights > inventory.maxStay) return null;
    if (nightly?.minStay && range.nights < nightly.minStay) return null;
    if (nightly?.maxStay && range.nights > nightly.maxStay) return null;
    if (nightly?.closedToArrival && date === checkIn) return null;
    if (nightly?.closedToDeparture && date === checkOut) return null;
    const rate = nightly?.rateAmount ?? plan.baseRateAmount;
    const currency = nightly?.rateCurrency ?? plan.baseRateCurrency;
    if (!Number.isSafeInteger(rate) || rate < 0 || currency !== NGN) return null;
    subtotal += rate;
    nightlyRates.push({ date, rate });
  }

  return { plan, nightlyRates, subtotal, currency: NGN };
}

function publicImage(url: string): boolean {
  try {
    return !new URL(url).hostname.endsWith('.example.test');
  } catch {
    return false;
  }
}

async function findHotels(
  range: StayRange,
  where: Prisma.HotelWhereInput
): Promise<HotelWithAvailability[]> {
  return prisma.hotel.findMany({
    where: { status: 'approved', ...where },
    include: hotelAvailabilityInclude(range.checkInDate, range.checkOutDate),
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

async function getCancellationPolicy(
  hotelId: string,
  policyId: string | null
): Promise<Prisma.CancellationPolicyGetPayload<Record<string, never>>> {
  const policy =
    (policyId
      ? await prisma.cancellationPolicy.findFirst({
          where: { id: policyId, OR: [{ hotelId }, { hotelId: null }] },
        })
      : null) ??
    (await prisma.cancellationPolicy.findFirst({
      where: { hotelId: null, isPlatformTemplate: true, template: 'flexible' },
      orderBy: { createdAt: 'asc' },
    }));
  if (!policy) throw new InternalError('A cancellation policy is not configured');
  return policy;
}

function cancellationTerms(
  policy: Prisma.CancellationPolicyGetPayload<Record<string, never>>,
  range: StayRange,
  checkInTime: string
): {
  id: string;
  name: string;
  description: string;
  freeCancellationUntil: string | null;
  refundPercent: number | null;
  termsHtml: string;
} {
  const [hour, minute] = checkInTime.split(':').map(Number);
  const checkInInstant = Date.UTC(
    Number(range.checkIn.slice(0, 4)),
    Number(range.checkIn.slice(5, 7)) - 1,
    Number(range.checkIn.slice(8, 10)),
    (hour ?? 14) - 1,
    minute ?? 0
  );
  const freeCancellationUntil =
    policy.freeCancellationUntilHoursBeforeCheckIn === null
      ? null
      : formatDateTime(
          new Date(checkInInstant - policy.freeCancellationUntilHoursBeforeCheckIn * 60 * 60 * 1000)
        );
  const refundPercent =
    policy.template === 'non_refundable'
      ? 0
      : (policy.refundPercentBeforeDays ?? (policy.template === 'flexible' ? 100 : null));
  return {
    id: policy.id,
    name: policy.name,
    description: policy.description,
    freeCancellationUntil,
    refundPercent,
    termsHtml: `<p>${escapeHtml(policy.description)}</p>`,
  };
}

function commissionAmount(amount: number, commissionBps: number): number {
  return calculateCommission({ amount, currency: NGN }, basisPoints(commissionBps)).amount;
}

export async function publicBookingRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/hotels/search',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['Availability'],
        summary: 'Search approved hotels with current room availability',
        body: apiSchema(availabilitySearchRequestSchema),
        response: { 200: apiSchema(availabilitySearchResponseSchema) },
      },
    },
    async (request) => {
      const body = availabilitySearchRequestSchema.parse(request.body);
      const range = stayRange(body.checkIn, body.checkOut);
      if (body.priceMin?.currency !== undefined && body.priceMin.currency !== NGN) {
        throw new ValidationError('Hotel search prices are currently available in NGN only');
      }
      if (body.priceMax?.currency !== undefined && body.priceMax.currency !== NGN) {
        throw new ValidationError('Hotel search prices are currently available in NGN only');
      }
      const destination = body.destination.trim();
      const hotels = await findHotels(range, {
        AND: [
          {
            OR: [
              { name: { contains: destination, mode: 'insensitive' } },
              { city: { contains: destination, mode: 'insensitive' } },
              { state: { contains: destination, mode: 'insensitive' } },
              { addressLine1: { contains: destination, mode: 'insensitive' } },
            ],
          },
          ...(body.propertyTypes?.length ? [{ propertyType: { in: body.propertyTypes } }] : []),
        ],
      });
      const now = new Date();
      const occupancy = await loadOccupancy(prisma, hotels, range, now);
      const availableHotels = hotels.flatMap((hotel) => {
        if (body.amenities?.some((amenity) => !hotel.amenities.includes(amenity))) return [];
        const categories = hotel.roomCategories.flatMap((category) => {
          if (
            body.adults > category.maxAdults * body.rooms ||
            body.children > category.maxChildren * body.rooms
          ) {
            return [];
          }
          const quantity = availableQuantity(category, range, occupancy);
          if (quantity < body.rooms) return [];
          const plans = category.ratePlans.flatMap((plan) => {
            const priced = pricePlan(category, plan, range);
            if (!priced || priced.currency !== NGN) return [];
            const total = priced.subtotal;
            if (body.priceMin && total < body.priceMin.amount) return [];
            if (body.priceMax && total > body.priceMax.amount) return [];
            return [
              {
                id: plan.id,
                name: plan.name,
                type: plan.type,
                price: { amount: total, currency: NGN },
                nightlySubtotal: priced.subtotal,
              },
            ];
          });
          if (plans.length === 0) return [];
          return [
            {
              id: category.id,
              name: category.name,
              slug: category.slug,
              maxAdults: category.maxAdults,
              maxChildren: category.maxChildren,
              baseRate: {
                amount: Math.min(
                  ...category.ratePlans.flatMap((plan) => {
                    const priced = pricePlan(category, plan, range);
                    return priced ? priced.nightlyRates.map((night) => night.rate) : [];
                  })
                ),
                currency: NGN,
              },
              availableQuantity: quantity,
              inventoryMode: category.inventoryMode,
              ratePlans: plans.map(({ id, name, type, price }) => ({ id, name, type, price })),
              minPrice: Math.min(...plans.map((plan) => plan.price.amount)),
              maxPrice: Math.max(...plans.map((plan) => plan.price.amount)),
            },
          ];
        });
        if (categories.length === 0) return [];
        const minPrice = Math.min(...categories.map((category) => category.minPrice));
        const maxPrice = Math.max(...categories.map((category) => category.maxPrice));
        return [
          {
            hotelId: hotel.id,
            hotelName: hotel.name,
            hotelSlug: hotel.slug,
            propertyType: hotel.propertyType,
            city: hotel.city,
            address: {
              line1: hotel.addressLine1,
              city: hotel.city,
              state: hotel.state,
              country: hotel.country,
            },
            images: hotel.images
              .filter((image) => publicImage(image.url))
              .map((image) => ({
                url: image.url,
                ...(image.caption ? { caption: image.caption } : {}),
              })),
            minPrice: { amount: minPrice, currency: NGN },
            maxPrice: { amount: maxPrice, currency: NGN },
            currency: NGN,
            availableRoomCategories: categories,
            description: hotel.description,
            amenities: hotel.amenities,
            rating: null,
            reviewCount: null,
          },
        ];
      });

      availableHotels.sort((left, right) => {
        if (body.sortBy === 'price_asc') return left.minPrice.amount - right.minPrice.amount;
        if (body.sortBy === 'price_desc') return right.minPrice.amount - left.minPrice.amount;
        if (body.sortBy === 'relevance') {
          const leftExact = left.city.toLowerCase() === destination.toLowerCase() ? 0 : 1;
          const rightExact = right.city.toLowerCase() === destination.toLowerCase() ? 0 : 1;
          if (leftExact !== rightExact) return leftExact - rightExact;
        }
        return left.hotelName.localeCompare(right.hotelName);
      });

      const page = body.page;
      const limit = body.limit;
      const total = availableHotels.length;
      return availabilitySearchResponseSchema.parse({
        data: availableHotels.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }
  );

  app.post(
    '/quotes',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['Bookings'],
        summary: 'Calculate and persist a server-authoritative room quote',
        body: apiSchema(quoteRequestSchema),
        response: { 201: apiSchema(quoteResponseSchema) },
      },
    },
    async (request, reply) => {
      const body = quoteRequestSchema.parse(request.body);
      if (body.promoCode) throw new ValidationError('Promotional codes are not available yet');
      const range = stayRange(body.checkIn, body.checkOut);
      const hotels = await findHotels(range, { id: body.hotelId });
      const hotel = hotels[0];
      if (!hotel) throw new NotFoundError('Hotel');
      const category = hotel.roomCategories.find((room) => room.id === body.roomCategoryId);
      if (!category) throw new NotFoundError('Room category');
      if (
        body.adults > category.maxAdults * body.rooms ||
        body.children > category.maxChildren * body.rooms
      ) {
        throw new ValidationError('The selected rooms do not have enough guest capacity');
      }

      const now = new Date();
      const occupancy = await loadOccupancy(prisma, [hotel], range, now);
      if (availableQuantity(category, range, occupancy) < body.rooms) {
        throw new ConflictError('ROOMS_UNAVAILABLE', 'The selected room is no longer available');
      }
      const candidates = category.ratePlans
        .filter((plan) => !body.ratePlanId || plan.id === body.ratePlanId)
        .map((plan) => pricePlan(category, plan, range))
        .filter((plan): plan is PricedPlan => plan !== null && plan.currency === NGN)
        .sort((left, right) => left.subtotal - right.subtotal);
      const selected = candidates[0];
      if (!selected) {
        throw new ConflictError('RATE_UNAVAILABLE', 'The selected rate is no longer available');
      }

      const policy = await getCancellationPolicy(hotel.id, selected.plan.cancellationPolicyId);
      const policyTerms = cancellationTerms(policy, range, hotel.checkInTime);
      const commissionAgreement = await prisma.commissionAgreement.findFirst({
        where: {
          hotelId: hotel.id,
          status: 'active',
          signedDocumentUrl: { not: null },
          effectiveFrom: { lte: range.checkInDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: range.checkInDate } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      const commissionBps = commissionAgreement?.commissionBps ?? 0;
      const subtotal = selected.subtotal * body.rooms;
      const expiresAt = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);
      const quote = {
        roomCategoryId: category.id,
        roomCategoryName: category.name,
        ratePlanId: selected.plan.id,
        ratePlanName: selected.plan.name,
        ratePlanType: selected.plan.type,
        nights: range.nights,
        rooms: body.rooms,
        nightlyRates: selected.nightlyRates.map((night) => ({
          date: night.date,
          rate: { amount: night.rate, currency: NGN },
          ratePlanId: selected.plan.id,
          ratePlanName: selected.plan.name,
        })),
        subtotal: { amount: subtotal, currency: NGN },
        discounts: [],
        taxes: [],
        mandatoryFees: [],
        optionalExtras: [],
        total: { amount: subtotal, currency: NGN },
        cancellationPolicy: {
          id: policyTerms.id,
          name: policyTerms.name,
          description: policyTerms.description,
          freeCancellationUntil: policyTerms.freeCancellationUntil,
          refundPercent: policyTerms.refundPercent,
        },
        commissionBps,
        quoteId: randomUUID(),
        expiresAt: formatDateTime(expiresAt),
        createdAt: formatDateTime(now),
      };
      const validatedQuote = quoteResponseSchema.parse(quote);
      await prisma.quote.create({
        data: {
          id: validatedQuote.quoteId,
          hotelId: hotel.id,
          roomCategoryId: category.id,
          ratePlanId: selected.plan.id,
          checkIn: range.checkInDate,
          checkOut: range.checkOutDate,
          adults: body.adults,
          children: body.children,
          rooms: body.rooms,
          snapshot: validatedQuote,
          expiresAt,
          ...(commissionAgreement ? { commissionAgreementId: commissionAgreement.id } : {}),
        },
      });
      return reply.status(201).send(validatedQuote);
    }
  );

  app.post(
    '/bookings',
    {
      preHandler: async (request) => {
        if (request.headers.authorization) await authenticate(request);
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['Bookings'],
        summary: 'Create a pending-payment booking and short inventory hold',
        body: apiSchema(bookingCreateRequestSchema),
        response: { 201: apiSchema(bookingResponseSchema) },
      },
    },
    async (request: FastifyRequest, reply) => {
      const body = bookingCreateRequestSchema.parse(request.body);
      if (request.auth && request.auth.user.role !== 'customer') {
        throw new ForbiddenError('Only customer accounts can create bookings');
      }
      if (body.rooms.length !== 1) {
        throw new ValidationError('A booking must match one quoted room category and rate plan');
      }
      const room = body.rooms[0]!;
      const primaryGuest = body.guests.find((guest) => guest.isPrimary) ?? body.guests[0]!;
      const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
      const now = new Date();
      const holdExpiresAt = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);

      const result = await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended(${`booking-idempotency:${body.idempotencyKey}`}, 0))`;
          const prior = await tx.idempotencyRecord.findUnique({
            where: { key: body.idempotencyKey },
          });
          if (prior && prior.expiresAt > now) {
            if (
              prior.operation !== 'booking.create' ||
              prior.requestHash !== requestHash ||
              prior.userId !== (request.auth?.user.id ?? null)
            ) {
              throw new ConflictError(
                'IDEMPOTENCY_KEY_REUSED',
                'This idempotency key was already used for a different request'
              );
            }
            if (!prior.responseBody) {
              throw new ConflictError(
                'BOOKING_IN_PROGRESS',
                'This booking request is still processing'
              );
            }
            return bookingResponseSchema.parse(prior.responseBody);
          }
          if (prior) {
            await tx.idempotencyRecord.delete({ where: { id: prior.id } });
          }

          const quote = await tx.quote.findUnique({ where: { id: body.quoteId } });
          if (!quote || quote.expiresAt <= now) {
            throw new ConflictError(
              'QUOTE_EXPIRED',
              'This quote has expired. Please request a new quote'
            );
          }
          if (quote.usedAt) {
            throw new ConflictError('QUOTE_ALREADY_USED', 'This quote has already been used');
          }
          const quoteSnapshot = quoteResponseSchema.parse(quote.snapshot);
          if (
            room.roomCategoryId !== quote.roomCategoryId ||
            room.ratePlanId !== quote.ratePlanId ||
            room.quantity !== quote.rooms ||
            room.adults !== quote.adults ||
            room.children !== quote.children
          ) {
            throw new ValidationError('Booking details must match the selected quote');
          }

          await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended(${`inventory-category:${quote.roomCategoryId}`}, 0))`;
          const consumed = await tx.quote.updateMany({
            where: { id: quote.id, usedAt: null, expiresAt: { gt: now } },
            data: { usedAt: now },
          });
          if (consumed.count !== 1) {
            throw new ConflictError('QUOTE_ALREADY_USED', 'This quote has already been used');
          }

          const range = stayRange(formatDate(quote.checkIn), formatDate(quote.checkOut));
          const hotels = await tx.hotel.findMany({
            where: { id: quote.hotelId, status: 'approved' },
            include: hotelAvailabilityInclude(range.checkInDate, range.checkOutDate),
          });
          const hotel = hotels[0];
          const category = hotel?.roomCategories.find((item) => item.id === quote.roomCategoryId);
          if (!hotel || !category) {
            throw new ConflictError('HOTEL_UNAVAILABLE', 'This hotel is no longer available');
          }
          const currentPlan = category.ratePlans.find((item) => item.id === quote.ratePlanId);
          const currentPrice = currentPlan ? pricePlan(category, currentPlan, range) : null;
          if (
            !currentPrice ||
            currentPrice.subtotal * quote.rooms !== quoteSnapshot.subtotal.amount ||
            currentPrice.nightlyRates.length !== quoteSnapshot.nightlyRates.length ||
            currentPrice.nightlyRates.some(
              (night, index) =>
                night.date !== quoteSnapshot.nightlyRates[index]?.date ||
                night.rate !== quoteSnapshot.nightlyRates[index]?.rate.amount
            )
          ) {
            throw new ConflictError(
              'QUOTE_STALE',
              'The room price changed after this quote. Please review an updated price'
            );
          }
          const occupancy = await loadOccupancy(tx, hotels, range, now);
          if (availableQuantity(category, range, occupancy) < quote.rooms) {
            throw new ConflictError(
              'ROOMS_UNAVAILABLE',
              'The selected room is no longer available'
            );
          }

          const total = quoteSnapshot.total.amount;
          const subtotal = quoteSnapshot.subtotal.amount;
          const commission = commissionAmount(subtotal, quoteSnapshot.commissionBps);
          const reference = `BK-${Date.now().toString(36).toUpperCase()}-${randomBytes(5).toString('hex').toUpperCase()}`;
          const accessToken = randomBytes(32).toString('base64url');
          const booking = await tx.booking.create({
            data: {
              reference,
              accessToken,
              hotelId: hotel.id,
              customerId: request.auth?.user.id ?? null,
              roomCategoryId: category.id,
              guestFirstName: primaryGuest.firstName,
              guestLastName: primaryGuest.lastName,
              guestEmail: primaryGuest.email,
              guestPhone: primaryGuest.phone,
              checkIn: quote.checkIn,
              checkOut: quote.checkOut,
              nights: quoteSnapshot.nights,
              adults: quote.adults,
              children: quote.children,
              rooms: quote.rooms,
              specialRequests: body.specialRequests ?? primaryGuest.specialRequests ?? null,
              subtotalAmount: subtotal,
              discountAmount: 0,
              taxAmount: 0,
              feesAmount: 0,
              totalAmount: total,
              cancellationPolicyId: quoteSnapshot.cancellationPolicy.id,
              cancellationPolicySnapshot: {
                cancellationPolicyId: quoteSnapshot.cancellationPolicy.id,
                policyName: quoteSnapshot.cancellationPolicy.name,
                policyDescription: quoteSnapshot.cancellationPolicy.description,
                freeCancellationUntil: quoteSnapshot.cancellationPolicy.freeCancellationUntil,
                refundPercent: quoteSnapshot.cancellationPolicy.refundPercent,
                termsHtml: `<p>${escapeHtml(quoteSnapshot.cancellationPolicy.description)}</p>`,
              },
              commissionBps: quoteSnapshot.commissionBps,
              commissionAmount: commission,
              commissionBasis: 'room_revenue',
              holdExpiresAt,
              roomsSnapshot: {
                create: {
                  roomCategoryId: category.id,
                  roomCategoryName: category.name,
                  ratePlanId: quote.ratePlanId,
                  ratePlanName: quoteSnapshot.ratePlanName,
                  ratePlanType: quoteSnapshot.ratePlanType,
                  adults: quote.adults,
                  children: quote.children,
                  quantity: quote.rooms,
                  subtotalAmount: subtotal,
                  totalAmount: total,
                  nights: {
                    create: quoteSnapshot.nightlyRates.map((night) => ({
                      date: parseDate(isoDate(night.date)),
                      rateAmount: night.rate.amount,
                      rateCurrency: night.rate.currency,
                      ratePlanId: night.ratePlanId,
                      ratePlanName: night.ratePlanName,
                    })),
                  },
                },
              },
              guests: {
                create: body.guests.map((guest, index) => ({
                  firstName: guest.firstName,
                  lastName: guest.lastName,
                  email: guest.email,
                  phone: guest.phone,
                  isPrimary: guest.isPrimary || index === 0,
                  specialRequests: guest.specialRequests,
                })),
              },
              statusHistory: {
                create: {
                  fromStatus: null,
                  toStatus: 'pending_payment',
                  actorId: request.auth?.user.id ?? null,
                  actorType: request.auth ? 'customer' : 'system',
                  reason: 'Awaiting payment provider setup',
                },
              },
              commissionSnapshot: {
                create: {
                  hotelId: hotel.id,
                  agreementId: quote.commissionAgreementId,
                  commissionBps: quoteSnapshot.commissionBps,
                  calculationBasis: 'room_revenue',
                  discountFundedBy: 'hotel',
                  amount: commission,
                },
              },
            },
          });
          await tx.inventoryHold.create({
            data: {
              hotelId: hotel.id,
              roomCategoryId: category.id,
              bookingId: booking.id,
              checkIn: quote.checkIn,
              checkOut: quote.checkOut,
              quantity: quote.rooms,
              status: 'active',
              expiresAt: holdExpiresAt,
            },
          });

          const response = bookingResponseSchema.parse({
            id: booking.id,
            reference: booking.reference,
            accessToken: booking.accessToken,
            status: booking.status,
            hotelId: booking.hotelId,
            hotelName: hotel.name,
            hotelSlug: hotel.slug,
            customerId: booking.customerId,
            guestEmail: booking.guestEmail,
            guestPhone: booking.guestPhone,
            checkIn: formatDate(booking.checkIn),
            checkOut: formatDate(booking.checkOut),
            nights: booking.nights,
            adults: booking.adults,
            children: booking.children,
            rooms: booking.rooms,
            roomsSnapshot: [
              {
                roomCategoryId: category.id,
                roomCategoryName: category.name,
                ratePlanId: quote.ratePlanId,
                ratePlanName: quoteSnapshot.ratePlanName,
                ratePlanType: quoteSnapshot.ratePlanType,
                adults: quote.adults,
                children: quote.children,
                quantity: quote.rooms,
                nights: quoteSnapshot.nightlyRates.map((night) => ({
                  date: night.date,
                  rate: night.rate,
                  ratePlanId: night.ratePlanId,
                  ratePlanName: night.ratePlanName,
                })),
                subtotal: quoteSnapshot.subtotal,
                taxes: quoteSnapshot.taxes,
                mandatoryFees: quoteSnapshot.mandatoryFees,
                total: quoteSnapshot.total,
              },
            ],
            policySnapshot: {
              cancellationPolicyId: quoteSnapshot.cancellationPolicy.id,
              policyName: quoteSnapshot.cancellationPolicy.name,
              policyDescription: quoteSnapshot.cancellationPolicy.description,
              freeCancellationUntil: quoteSnapshot.cancellationPolicy.freeCancellationUntil,
              refundPercent: quoteSnapshot.cancellationPolicy.refundPercent,
              termsHtml: `<p>${escapeHtml(quoteSnapshot.cancellationPolicy.description)}</p>`,
            },
            commissionSnapshot: {
              agreementId: quote.commissionAgreementId,
              commissionBps: quoteSnapshot.commissionBps,
              calculationBasis: 'room_revenue',
              discountFundedBy: 'hotel',
              amount: { amount: commission, currency: NGN },
            },
            pricingSnapshot: {
              subtotal: quoteSnapshot.subtotal,
              discounts: quoteSnapshot.discounts,
              taxes: quoteSnapshot.taxes,
              mandatoryFees: quoteSnapshot.mandatoryFees,
              optionalExtras: quoteSnapshot.optionalExtras.map(({ id, name, amount }) => ({
                id,
                name,
                amount,
              })),
              total: quoteSnapshot.total,
              currency: NGN,
            },
            paymentId: null,
            holdExpiresAt: formatDateTime(holdExpiresAt),
            confirmedAt: null,
            checkedInAt: null,
            checkedOutAt: null,
            cancelledAt: null,
            cancellationReason: null,
            createdAt: formatDateTime(booking.createdAt),
            updatedAt: formatDateTime(booking.updatedAt),
          });

          await tx.idempotencyRecord.create({
            data: {
              key: body.idempotencyKey,
              userId: request.auth?.user.id ?? null,
              operation: 'booking.create',
              requestHash,
              responseBody: response,
              statusCode: 201,
              expiresAt: new Date(now.getTime() + IDEMPOTENCY_HOURS * 60 * 60 * 1000),
            },
          });
          return response;
        },
        { isolationLevel: 'ReadCommitted' }
      );
      return reply.status(201).send(result);
    }
  );
}
