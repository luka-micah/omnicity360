import type { Hotel, User } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { generateOpaqueToken, hashToken, signAccessToken } from '../src/auth/tokens.js';
import { hashPassword } from '../src/lib/password.js';

import { resetDatabase, testPrisma } from './helpers/db.js';

const PASSWORD_HASH_PLACEHOLDER = 'not-used-in-these-tests';
const PASSWORD = 'StrongPass123';

let passwordHash = PASSWORD_HASH_PLACEHOLDER;

const VALID_DOCUMENT_URL = 'https://documents.example.test/cac-cert.pdf';
const VALID_IMAGE_URL = 'https://images.example.test/lobby.jpg';

async function createUser(
  email: string,
  role: 'customer' | 'hotel_owner' | 'hotel_staff' | 'platform_admin'
): Promise<User> {
  return testPrisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: 'Test',
      lastName: role,
      role,
      emailVerified: true,
    },
  });
}

async function createAccessToken(userId: string): Promise<string> {
  const session = await testPrisma.userSession.create({
    data: {
      userId,
      refreshTokenHash: hashToken(generateOpaqueToken()),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      ipAddress: '127.0.0.1',
    },
  });
  return signAccessToken(userId, session.id);
}

function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

interface CreateHotelOptions {
  name?: string;
  slug?: string;
  status?: Hotel['status'];
}

async function createHotel(partnerId: string, options: CreateHotelOptions = {}): Promise<Hotel> {
  const name = options.name ?? 'Test Hotel';
  const status = options.status ?? 'draft';
  const hotel = await testPrisma.hotel.create({
    data: {
      partnerId,
      name,
      slug: options.slug ?? name.toLowerCase().replace(/\s+/g, '-'),
      propertyType: 'hotel',
      addressLine1: '1 Test Street',
      city: 'Lagos',
      state: 'Lagos',
      status,
      ...(status === 'approved' ? { approvedAt: new Date(), defaultCommissionBps: 1000 } : {}),
      ...(status === 'submitted' ? { submittedAt: new Date() } : {}),
      ...(status === 'under_review' ? { submittedAt: new Date() } : {}),
      ...(status === 'suspended' ? { approvedAt: new Date(), suspendedAt: new Date() } : {}),
    },
  });

  // Mirror what POST /partner/hotels writes so lifecycle assertions start from a
  // realistic baseline instead of an empty history.
  await testPrisma.hotelStatusHistory.create({
    data: {
      hotelId: hotel.id,
      fromStatus: null,
      toStatus: status,
      actorId: partnerId,
      actorType: 'system',
      notes: 'Seeded for test',
    },
  });
  await testPrisma.auditLog.create({
    data: {
      actorId: partnerId,
      actorType: 'hotel_owner',
      action: 'hotel_created',
      entityType: 'hotel',
      entityId: hotel.id,
      newValues: { name, slug: hotel.slug, status },
    },
  });

  return hotel;
}

function baseHotelPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Lekki Palm Hotel',
    propertyType: 'hotel',
    address: { line1: '12 Admiralty Way', city: 'Lekki', state: 'Lagos' },
    contact: { email: 'stay@example.test', phone: '+2348011112222' },
    ...overrides,
  };
}

describe('partner hotel onboarding', () => {
  let app: FastifyInstance;
  let ownerA: User;
  let ownerB: User;
  let customer: User;
  let admin: User;
  let ownerAToken: string;
  let ownerBToken: string;
  let customerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
    app = await buildApp({ logger: false });
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase();

    ownerA = await createUser('owner-a@example.test', 'hotel_owner');
    ownerB = await createUser('owner-b@example.test', 'hotel_owner');
    customer = await createUser('customer@example.test', 'customer');
    admin = await createUser('admin@example.test', 'platform_admin');

    ownerAToken = await createAccessToken(ownerA.id);
    ownerBToken = await createAccessToken(ownerB.id);
    customerToken = await createAccessToken(customer.id);
    adminToken = await createAccessToken(admin.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a draft hotel with a generated slug, owner membership, and history', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/partner/hotels',
      headers: auth(ownerAToken),
      payload: baseHotelPayload(),
    });

    expect(response.statusCode, response.body).toBe(201);
    const hotel = response.json();
    expect(hotel).toMatchObject({
      name: 'Lekki Palm Hotel',
      slug: 'lekki-palm-hotel',
      status: 'draft',
      partnerId: ownerA.id,
      defaultCommissionBps: null,
      rejectionReason: null,
      submissionNotes: null,
      archivedAt: null,
      images: [],
      documents: [],
    });
    expect(hotel.internalNotes).toBeUndefined();
    expect(hotel.address).toMatchObject({
      line1: '12 Admiralty Way',
      city: 'Lekki',
      country: 'NG',
    });
    expect(hotel.contact).toMatchObject({ email: 'stay@example.test' });
    expect(hotel.statusHistory).toHaveLength(1);
    expect(hotel.statusHistory[0]).toMatchObject({
      fromStatus: null,
      toStatus: 'draft',
      actorId: ownerA.id,
    });

    const membership = await testPrisma.hotelMembership.findFirst({
      where: { hotelId: hotel.id, userId: ownerA.id, role: 'owner', status: 'active' },
    });
    expect(membership).not.toBeNull();

    const audit = await testPrisma.auditLog.findFirst({
      where: { action: 'hotel_created', entityId: hotel.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(ownerA.id);
  });

  it('rejects duplicate explicit slugs, invalid slugs, and suffixes generated collisions', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/partner/hotels',
      headers: auth(ownerAToken),
      payload: baseHotelPayload({ slug: 'dup-hotel' }),
    });
    expect(first.statusCode, first.body).toBe(201);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/partner/hotels',
      headers: auth(ownerBToken),
      payload: baseHotelPayload({ slug: 'dup-hotel' }),
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('SLUG_ALREADY_EXISTS');

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/partner/hotels',
      headers: auth(ownerAToken),
      payload: baseHotelPayload({ slug: 'Not A Slug' }),
    });
    expect(invalid.statusCode).toBe(422);

    // Generated slugs never collide silently; they get a numeric suffix.
    await createHotel(ownerB.id, { name: 'Palm Inn', slug: 'palm-inn' });
    const generated = await app.inject({
      method: 'POST',
      url: '/api/v1/partner/hotels',
      headers: auth(ownerAToken),
      payload: baseHotelPayload({ name: 'Palm Inn' }),
    });
    expect(generated.statusCode, generated.body).toBe(201);
    expect(generated.json().slug).toBe('palm-inn-2');
  });

  it('only lets hotel owners create hotels', async () => {
    const asCustomer = await app.inject({
      method: 'POST',
      url: '/api/v1/partner/hotels',
      headers: auth(customerToken),
      payload: baseHotelPayload(),
    });
    expect(asCustomer.statusCode).toBe(403);

    const asAdmin = await app.inject({
      method: 'POST',
      url: '/api/v1/partner/hotels',
      headers: auth(adminToken),
      payload: baseHotelPayload(),
    });
    expect(asAdmin.statusCode).toBe(403);

    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/v1/partner/hotels',
      payload: baseHotelPayload(),
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('lists only the hotels a caller owns or actively manages', async () => {
    const hotelA = await createHotel(ownerA.id, { name: 'Hotel A', slug: 'hotel-a' });
    const hotelB = await createHotel(ownerB.id, {
      name: 'Hotel B',
      slug: 'hotel-b',
      status: 'approved',
    });
    const hotelC = await createHotel(ownerA.id, {
      name: 'Hotel C Draft',
      slug: 'hotel-c-draft',
      status: 'draft',
    });

    const owned = await app.inject({
      method: 'GET',
      url: '/api/v1/partner/hotels',
      headers: auth(ownerAToken),
    });
    expect(owned.statusCode, owned.body).toBe(200);
    const ownedIds = owned
      .json()
      .data.map((entry: { id: string }) => entry.id)
      .sort();
    expect(ownedIds).toEqual([hotelA.id, hotelC.id].sort());
    expect(owned.json().pagination).toMatchObject({ page: 1, limit: 20, total: 2 });

    const approvedOnly = await app.inject({
      method: 'GET',
      url: '/api/v1/partner/hotels?status=approved',
      headers: auth(ownerBToken),
    });
    expect(approvedOnly.statusCode).toBe(200);
    expect(approvedOnly.json().data).toHaveLength(1);
    expect(approvedOnly.json().data[0].id).toBe(hotelB.id);

    const asCustomer = await app.inject({
      method: 'GET',
      url: '/api/v1/partner/hotels',
      headers: auth(customerToken),
    });
    expect(asCustomer.statusCode).toBe(200);
    expect(asCustomer.json().data).toEqual([]);

    const asAdmin = await app.inject({
      method: 'GET',
      url: '/api/v1/partner/hotels',
      headers: auth(adminToken),
    });
    expect(asAdmin.statusCode).toBe(200);
    expect(asAdmin.json().pagination.total).toBe(3);
  });

  it('keeps hotel detail and mutations inside the tenant boundary', async () => {
    const hotelA = await createHotel(ownerA.id, { name: 'Hotel A', slug: 'hotel-a' });

    const ownDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/partner/hotels/${hotelA.id}`,
      headers: auth(ownerAToken),
    });
    expect(ownDetail.statusCode, ownDetail.body).toBe(200);

    const foreignDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/partner/hotels/${hotelA.id}`,
      headers: auth(ownerBToken),
    });
    expect(foreignDetail.statusCode).toBe(404);
    expect(foreignDetail.json().error.code).toBe('NOT_FOUND');

    const foreignPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/partner/hotels/${hotelA.id}`,
      headers: auth(ownerBToken),
      payload: { name: 'Hijacked' },
    });
    expect(foreignPatch.statusCode).toBe(404);

    const foreignSubmit = await app.inject({
      method: 'POST',
      url: `/api/v1/partner/hotels/${hotelA.id}/submit`,
      headers: auth(ownerBToken),
      payload: { documents: [{ type: 'other', url: VALID_DOCUMENT_URL }] },
    });
    expect(foreignSubmit.statusCode).toBe(404);

    const anonymous = await app.inject({
      method: 'GET',
      url: `/api/v1/partner/hotels/${hotelA.id}`,
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('updates content partially and locks the slug once approved', async () => {
    const draft = await createHotel(ownerA.id, { name: 'Draft Hotel', slug: 'draft-hotel' });
    const approved = await createHotel(ownerA.id, {
      name: 'Approved Hotel',
      slug: 'approved-hotel',
      status: 'approved',
    });

    const partial = await app.inject({
      method: 'PATCH',
      url: `/api/v1/partner/hotels/${draft.id}`,
      headers: auth(ownerAToken),
      payload: { address: { city: 'Abuja' }, description: 'Now with a description' },
    });
    expect(partial.statusCode, partial.body).toBe(200);
    expect(partial.json()).toMatchObject({
      name: 'Draft Hotel',
      slug: 'draft-hotel',
      description: 'Now with a description',
      address: { line1: '1 Test Street', city: 'Abuja', state: 'Lagos' },
    });

    const slugChange = await app.inject({
      method: 'PATCH',
      url: `/api/v1/partner/hotels/${draft.id}`,
      headers: auth(ownerAToken),
      payload: { slug: 'draft-hotel-renamed' },
    });
    expect(slugChange.statusCode, slugChange.body).toBe(200);
    expect(slugChange.json().slug).toBe('draft-hotel-renamed');

    const approvedSlugChange = await app.inject({
      method: 'PATCH',
      url: `/api/v1/partner/hotels/${approved.id}`,
      headers: auth(ownerAToken),
      payload: { slug: 'approved-renamed' },
    });
    expect(approvedSlugChange.statusCode).toBe(409);
    expect(approvedSlugChange.json().error.code).toBe('SLUG_IMMUTABLE');

    const approvedContent = await app.inject({
      method: 'PATCH',
      url: `/api/v1/partner/hotels/${approved.id}`,
      headers: auth(ownerAToken),
      payload: { name: 'Approved Hotel Deluxe' },
    });
    expect(approvedContent.statusCode, approvedContent.body).toBe(200);
    expect(approvedContent.json().name).toBe('Approved Hotel Deluxe');

    const submitted = await createHotel(ownerA.id, {
      name: 'Submitted Hotel',
      slug: 'submitted-hotel',
      status: 'submitted',
    });
    const locked = await app.inject({
      method: 'PATCH',
      url: `/api/v1/partner/hotels/${submitted.id}`,
      headers: auth(ownerAToken),
      payload: { name: 'Nope' },
    });
    expect(locked.statusCode).toBe(409);
    expect(locked.json().error.code).toBe('HOTEL_LOCKED_FOR_REVIEW');

    const audits = await testPrisma.auditLog.findMany({
      where: { action: 'hotel_updated' },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits).toHaveLength(3);
    const changedFields = audits
      .map((entry) => (entry.metadata as { changedFields: string[] }).changedFields.slice().sort())
      .sort((a, b) => a.join(',').localeCompare(b.join(',')));
    expect(changedFields).toEqual([['city', 'description'], ['name'], ['slug']]);
  });

  it('manages image metadata with tenant guards', async () => {
    const hotelA = await createHotel(ownerA.id, { name: 'Hotel A', slug: 'hotel-a' });
    const hotelB = await createHotel(ownerB.id, { name: 'Hotel B', slug: 'hotel-b' });

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/partner/hotels/${hotelA.id}/media`,
      headers: auth(ownerAToken),
      payload: {
        url: VALID_IMAGE_URL,
        caption: 'Lobby',
        altText: 'Hotel lobby',
        sortOrder: 3,
        width: 1600,
        height: 900,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({
      url: VALID_IMAGE_URL,
      caption: 'Lobby',
      sortOrder: 3,
      width: 1600,
      height: 900,
    });

    const unsafe = await app.inject({
      method: 'POST',
      url: `/api/v1/partner/hotels/${hotelA.id}/media`,
      headers: auth(ownerAToken),
      payload: { url: 'javascript:alert(1)' },
    });
    expect(unsafe.statusCode).toBe(422);

    const mediaId = created.json().id;
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/partner/hotels/${hotelA.id}/media/${mediaId}`,
      headers: auth(ownerAToken),
      payload: { caption: 'Renamed lobby', sortOrder: 1 },
    });
    expect(patched.statusCode, patched.body).toBe(200);
    expect(patched.json()).toMatchObject({ caption: 'Renamed lobby', sortOrder: 1 });

    const foreignAdd = await app.inject({
      method: 'POST',
      url: `/api/v1/partner/hotels/${hotelA.id}/media`,
      headers: auth(ownerBToken),
      payload: { url: VALID_IMAGE_URL },
    });
    expect(foreignAdd.statusCode).toBe(404);

    const foreignDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/partner/hotels/${hotelA.id}/media/${mediaId}`,
      headers: auth(ownerBToken),
    });
    expect(foreignDelete.statusCode).toBe(404);

    const submitted = await createHotel(ownerA.id, {
      name: 'Locked',
      slug: 'locked-hotel',
      status: 'under_review',
    });
    const lockedAdd = await app.inject({
      method: 'POST',
      url: `/api/v1/partner/hotels/${submitted.id}/media`,
      headers: auth(ownerAToken),
      payload: { url: VALID_IMAGE_URL },
    });
    expect(lockedAdd.statusCode).toBe(409);
    expect(lockedAdd.json().error.code).toBe('HOTEL_LOCKED_FOR_REVIEW');

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/partner/hotels/${hotelA.id}/media/${mediaId}`,
      headers: auth(ownerAToken),
    });
    expect(removed.statusCode).toBe(204);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/partner/hotels/${hotelA.id}`,
      headers: auth(ownerAToken),
    });
    expect(detail.json().images).toEqual([]);
    expect(hotelB.id).toBeTruthy();
  });

  it('submits a draft with documents and records lifecycle history', async () => {
    const hotel = await createHotel(ownerA.id, { name: 'Draft Hotel', slug: 'draft-hotel' });

    const missingDocuments = await app.inject({
      method: 'POST',
      url: `/api/v1/partner/hotels/${hotel.id}/submit`,
      headers: auth(ownerAToken),
      payload: {},
    });
    expect(missingDocuments.statusCode).toBe(422);

    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/partner/hotels/${hotel.id}/submit`,
      headers: auth(ownerAToken),
      payload: {
        notes: 'All registration documents attached.',
        documents: [
          { type: 'cac_certificate', url: VALID_DOCUMENT_URL, description: 'CAC certificate' },
          { type: 'tax_clearance', url: 'https://documents.example.test/tax.pdf' },
        ],
      },
    });

    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json()).toMatchObject({
      status: 'submitted',
      submissionNotes: 'All registration documents attached.',
      rejectionReason: null,
    });
    expect(submitted.json().submittedAt).not.toBeNull();
    expect(submitted.json().documents).toHaveLength(2);
    expect(submitted.json().documents[0]).toMatchObject({
      type: 'cac_certificate',
      url: VALID_DOCUMENT_URL,
      verified: false,
    });
    expect(submitted.json().statusHistory).toHaveLength(2);
    expect(submitted.json().statusHistory[1]).toMatchObject({
      fromStatus: 'draft',
      toStatus: 'submitted',
      notes: 'All registration documents attached.',
    });

    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/partner/hotels/${hotel.id}/submit`,
      headers: auth(ownerAToken),
      payload: { documents: [{ type: 'other', url: VALID_DOCUMENT_URL }] },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('HOTEL_NOT_SUBMITTABLE');

    const audits = await testPrisma.auditLog.findMany({ where: { action: 'hotel_submitted' } });
    expect(audits).toHaveLength(1);
  });

  it('lets a rejected hotel be edited and resubmitted', async () => {
    const hotel = await createHotel(ownerA.id, {
      name: 'Rejected Hotel',
      slug: 'rejected-hotel',
      status: 'rejected',
    });
    await testPrisma.hotel.update({
      where: { id: hotel.id },
      data: { rejectionReason: 'Missing fire safety certificate' },
    });

    const resubmit = await app.inject({
      method: 'POST',
      url: `/api/v1/partner/hotels/${hotel.id}/submit`,
      headers: auth(ownerAToken),
      payload: {
        documents: [{ type: 'fire_safety', url: 'https://documents.example.test/fire-safety.pdf' }],
      },
    });

    expect(resubmit.statusCode, resubmit.body).toBe(200);
    expect(resubmit.json()).toMatchObject({ status: 'submitted', rejectionReason: null });
    expect(resubmit.json().statusHistory.at(-1)).toMatchObject({
      fromStatus: 'rejected',
      toStatus: 'submitted',
    });
  });

  it('walks a submission through admin review and approval', async () => {
    const hotel = await createHotel(ownerA.id, { name: 'Review Hotel', slug: 'review-hotel' });
    await app.inject({
      method: 'POST',
      url: `/api/v1/partner/hotels/${hotel.id}/submit`,
      headers: auth(ownerAToken),
      payload: { documents: [{ type: 'cac_certificate', url: VALID_DOCUMENT_URL }] },
    });

    const reviewed = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/hotels/${hotel.id}/review`,
      headers: auth(adminToken),
      payload: { notes: 'Checking CAC details.' },
    });
    expect(reviewed.statusCode, reviewed.body).toBe(200);
    expect(reviewed.json()).toMatchObject({ status: 'under_review', partner: { id: ownerA.id } });

    const approved = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/hotels/${hotel.id}/approve`,
      headers: auth(adminToken),
      payload: { commissionBps: 1200, notes: 'Verified in company registry.' },
    });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json()).toMatchObject({
      status: 'approved',
      defaultCommissionBps: 1200,
      approvedBy: admin.id,
      internalNotes: expect.stringContaining('Verified in company registry.'),
    });
    expect(approved.json().approvedAt).not.toBeNull();
    expect(approved.json().statusHistory).toHaveLength(4);

    const auditActions = (
      await testPrisma.auditLog.findMany({
        where: { entityType: 'hotel', entityId: hotel.id },
        orderBy: { createdAt: 'asc' },
      })
    ).map((entry) => entry.action);
    expect(auditActions).toEqual([
      'hotel_created',
      'hotel_submitted',
      'hotel_review_started',
      'hotel_approved',
    ]);

    const approveAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/hotels/${hotel.id}/approve`,
      headers: auth(adminToken),
      payload: {},
    });
    expect(approveAgain.statusCode).toBe(409);
    expect(approveAgain.json().error.code).toBe('HOTEL_INVALID_TRANSITION');
  });

  it('rejects invalid admin transitions and missing rejection reasons', async () => {
    const draft = await createHotel(ownerA.id, { name: 'Draft Hotel', slug: 'draft-hotel' });

    const approveDraft = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/hotels/${draft.id}/approve`,
      headers: auth(adminToken),
      payload: {},
    });
    expect(approveDraft.statusCode).toBe(409);
    expect(approveDraft.json().error.code).toBe('HOTEL_INVALID_TRANSITION');

    const reviewDraft = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/hotels/${draft.id}/review`,
      headers: auth(adminToken),
      payload: {},
    });
    expect(reviewDraft.statusCode).toBe(409);

    const submitted = await createHotel(ownerA.id, {
      name: 'Submitted Hotel',
      slug: 'submitted-hotel',
      status: 'submitted',
    });
    const missingReason = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/hotels/${submitted.id}/reject`,
      headers: auth(adminToken),
      payload: {},
    });
    expect(missingReason.statusCode).toBe(422);

    const suspendDraft = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/hotels/${draft.id}/suspend`,
      headers: auth(adminToken),
      payload: { reason: 'Policy breach' },
    });
    expect(suspendDraft.statusCode).toBe(409);

    const unknownHotel = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/hotels/0b6a4f2e-6a41-4a3e-9aa2-2f1a4b7c8d90',
      headers: auth(adminToken),
    });
    expect(unknownHotel.statusCode).toBe(404);
  });

  it('rejects a submission and lets the partner fix and resubmit it', async () => {
    const hotel = await createHotel(ownerA.id, { name: 'Reject Hotel', slug: 'reject-hotel' });
    await app.inject({
      method: 'POST',
      url: `/api/v1/partner/hotels/${hotel.id}/submit`,
      headers: auth(ownerAToken),
      payload: { documents: [{ type: 'cac_certificate', url: VALID_DOCUMENT_URL }] },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/admin/hotels/${hotel.id}/review`,
      headers: auth(adminToken),
      payload: {},
    });

    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/hotels/${hotel.id}/reject`,
      headers: auth(adminToken),
      payload: {
        rejectionReason: 'CAC number does not match the company name',
        notes: 'See attached check.',
      },
    });
    expect(rejected.statusCode, rejected.body).toBe(200);
    expect(rejected.json()).toMatchObject({
      status: 'rejected',
      rejectionReason: 'CAC number does not match the company name',
    });

    const resubmit = await app.inject({
      method: 'POST',
      url: `/api/v1/partner/hotels/${hotel.id}/submit`,
      headers: auth(ownerAToken),
      payload: { documents: [{ type: 'cac_certificate', url: VALID_DOCUMENT_URL }] },
    });
    expect(resubmit.statusCode, resubmit.body).toBe(200);
    expect(resubmit.json().status).toBe('submitted');
  });

  it('suspends and reinstates an approved hotel', async () => {
    const hotel = await createHotel(ownerA.id, {
      name: 'Approved Hotel',
      slug: 'approved-hotel',
      status: 'approved',
    });

    const suspended = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/hotels/${hotel.id}/suspend`,
      headers: auth(adminToken),
      payload: { reason: 'Fire safety inspection outstanding', notifyPartner: true },
    });
    expect(suspended.statusCode, suspended.body).toBe(200);
    expect(suspended.json()).toMatchObject({
      status: 'suspended',
      internalNotes: expect.stringContaining('Fire safety inspection outstanding'),
    });
    expect(suspended.json().suspendedAt).not.toBeNull();

    const suspendAudit = await testPrisma.auditLog.findFirst({
      where: { action: 'hotel_suspended', entityId: hotel.id },
    });
    expect(suspendAudit?.severity).toBe('warning');
    expect(suspendAudit?.metadata).toMatchObject({ notifyPartner: true });

    const partnerStillSeesHistory = await app.inject({
      method: 'GET',
      url: `/api/v1/partner/hotels/${hotel.id}`,
      headers: auth(ownerAToken),
    });
    expect(partnerStillSeesHistory.statusCode, partnerStillSeesHistory.body).toBe(200);
    // Internal notes stay out of the partner payload.
    expect(partnerStillSeesHistory.json().internalNotes).toBeUndefined();
    expect(partnerStillSeesHistory.json().statusHistory.at(-1)).toMatchObject({
      fromStatus: 'approved',
      toStatus: 'suspended',
      reason: 'Fire safety inspection outstanding',
    });

    const reinstated = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/hotels/${hotel.id}/reinstate`,
      headers: auth(adminToken),
      payload: { notes: 'Inspection passed.' },
    });
    expect(reinstated.statusCode, reinstated.body).toBe(200);
    expect(reinstated.json()).toMatchObject({ status: 'approved', suspendedAt: null });

    const reinstateAudit = await testPrisma.auditLog.findFirst({
      where: { action: 'hotel_reinstated', entityId: hotel.id },
    });
    expect(reinstateAudit).not.toBeNull();
  });

  it('restricts admin endpoints to platform administrators', async () => {
    const hotel = await createHotel(ownerA.id, { name: 'Hotel A', slug: 'hotel-a' });

    const listAsOwner = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/hotels',
      headers: auth(ownerAToken),
    });
    expect(listAsOwner.statusCode).toBe(403);

    const approveAsCustomer = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/hotels/${hotel.id}/approve`,
      headers: auth(customerToken),
      payload: {},
    });
    expect(approveAsCustomer.statusCode).toBe(403);

    const listAnon = await app.inject({ method: 'GET', url: '/api/v1/admin/hotels' });
    expect(listAnon.statusCode).toBe(401);
  });

  it('filters, searches, and paginates the admin hotel list', async () => {
    const first = await createHotel(ownerA.id, { name: 'Lekki Palm Hotel', slug: 'lekki-palm' });
    const second = await createHotel(ownerB.id, {
      name: 'Wuse Central Suites',
      slug: 'wuse-central',
      status: 'approved',
    });
    const third = await createHotel(ownerB.id, {
      name: 'Ikoyi Bay Residences',
      slug: 'ikoyi-bay',
      status: 'submitted',
    });

    await testPrisma.hotelDocument.create({
      data: { hotelId: second.id, type: 'cac_certificate', url: VALID_DOCUMENT_URL },
    });

    const all = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/hotels?sortBy=name&sortOrder=asc',
      headers: auth(adminToken),
    });
    expect(all.statusCode, all.body).toBe(200);
    expect(all.json().data.map((entry: { slug: string }) => entry.slug)).toEqual([
      'ikoyi-bay',
      'lekki-palm',
      'wuse-central',
    ]);
    expect(all.json().data[2]).toMatchObject({
      documentCount: 1,
      partner: { id: ownerB.id, email: ownerB.email },
    });

    const approved = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/hotels?status=approved',
      headers: auth(adminToken),
    });
    expect(approved.json().pagination.total).toBe(1);
    expect(approved.json().data[0].id).toBe(second.id);

    const searched = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/hotels?search=wuse',
      headers: auth(adminToken),
    });
    expect(searched.json().pagination.total).toBe(1);

    const byCity = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/hotels?city=Lagos',
      headers: auth(adminToken),
    });
    expect(byCity.json().pagination.total).toBe(3);

    const paged = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/hotels?limit=2&page=2',
      headers: auth(adminToken),
    });
    expect(paged.json().pagination).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(paged.json().data).toHaveLength(1);
    expect(first.id).toBeTruthy();
    expect(third.id).toBeTruthy();
  });

  it('lets only one concurrent approval win the transition', async () => {
    const hotel = await createHotel(ownerA.id, {
      name: 'Race Hotel',
      slug: 'race-hotel',
      status: 'under_review',
    });

    const [first, second] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/admin/hotels/${hotel.id}/approve`,
        headers: auth(adminToken),
        payload: {},
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/admin/hotels/${hotel.id}/approve`,
        headers: auth(adminToken),
        payload: {},
      }),
    ]);

    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    const stored = await testPrisma.hotel.findUniqueOrThrow({ where: { id: hotel.id } });
    expect(stored.status).toBe('approved');

    const approvals = await testPrisma.hotelStatusHistory.count({
      where: { hotelId: hotel.id, toStatus: 'approved' },
    });
    expect(approvals).toBe(1);
  });
});
