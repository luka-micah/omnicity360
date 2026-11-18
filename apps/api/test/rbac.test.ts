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

async function createHotel(partnerId: string, name: string, slug: string): Promise<Hotel> {
  return testPrisma.hotel.create({
    data: {
      partnerId,
      name,
      slug,
      propertyType: 'hotel',
      addressLine1: '1 Test Street',
      city: 'Lagos',
      state: 'Lagos',
      status: 'approved',
      approvedAt: new Date(),
    },
  });
}

function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

describe('hotel RBAC and tenant isolation', () => {
  let app: FastifyInstance;
  let ownerA: User;
  let ownerB: User;
  let customer: User;
  let admin: User;
  let hotelA: Hotel;
  let hotelB: Hotel;
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

    hotelA = await createHotel(ownerA.id, 'Hotel A', 'hotel-a');
    hotelB = await createHotel(ownerB.id, 'Hotel B', 'hotel-b');

    await testPrisma.hotelMembership.createMany({
      data: [
        {
          hotelId: hotelA.id,
          userId: ownerA.id,
          role: 'owner',
          status: 'active',
          acceptedAt: new Date(),
        },
        {
          hotelId: hotelB.id,
          userId: ownerB.id,
          role: 'owner',
          status: 'active',
          acceptedAt: new Date(),
        },
      ],
    });

    ownerAToken = await createAccessToken(ownerA.id);
    ownerBToken = await createAccessToken(ownerB.id);
    customerToken = await createAccessToken(customer.id);
    adminToken = await createAccessToken(admin.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it('invites a registered user, lets them accept, and lists hotel staff', async () => {
    const invite = await app.inject({
      method: 'POST',
      url: '/api/v1/partner/staff/invitations',
      headers: auth(ownerAToken),
      payload: {
        email: customer.email,
        role: 'front_desk',
        hotelId: hotelA.id,
      },
    });
    expect(invite.statusCode, invite.body).toBe(201);
    const invitation = invite.json();
    expect(invitation).toMatchObject({
      userId: customer.id,
      hotelId: hotelA.id,
      role: 'front_desk',
      status: 'pending',
      acceptedAt: null,
    });

    const pending = await app.inject({
      method: 'GET',
      url: '/api/v1/me/memberships',
      headers: auth(customerToken),
    });
    expect(pending.statusCode).toBe(200);
    expect(pending.json().data).toHaveLength(1);
    expect(pending.json().data[0]).toMatchObject({
      hotelId: hotelA.id,
      hotelName: 'Hotel A',
      status: 'pending',
    });

    const accept = await app.inject({
      method: 'POST',
      url: '/api/v1/partner/staff/invitations/accept',
      headers: auth(customerToken),
      payload: { membershipId: invitation.id },
    });
    expect(accept.statusCode, accept.body).toBe(200);
    expect(accept.json()).toMatchObject({ status: 'active', role: 'front_desk' });

    const staff = await app.inject({
      method: 'GET',
      url: `/api/v1/partner/hotels/${hotelA.id}/staff`,
      headers: auth(ownerAToken),
    });
    expect(staff.statusCode).toBe(200);
    expect(staff.json().data).toHaveLength(1);
    expect(staff.json().data[0].user.email).toBe(customer.email);
    expect(staff.json().pagination).toMatchObject({ page: 1, total: 1, totalPages: 1 });

    const staffUser = await testPrisma.user.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(staffUser.role).toBe('hotel_staff');

    // front_desk can access the hotel but cannot manage staff
    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/partner/hotels/${hotelA.id}/staff`,
      headers: auth(customerToken),
    });
    expect(denied.statusCode).toBe(403);

    const audits = await testPrisma.auditLog.findMany({
      where: { action: { in: ['staff_invited', 'staff_invitation_accepted'] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((entry) => entry.action)).toEqual([
      'staff_invited',
      'staff_invitation_accepted',
    ]);
  });

  it('returns 404 when a different tenant, customer, or anonymous caller probes a hotel', async () => {
    const foreignOwner = await app.inject({
      method: 'GET',
      url: `/api/v1/partner/hotels/${hotelA.id}/staff`,
      headers: auth(ownerBToken),
    });
    expect(foreignOwner.statusCode).toBe(404);
    expect(foreignOwner.json().error.code).toBe('NOT_FOUND');

    const foreignInvite = await app.inject({
      method: 'POST',
      url: '/api/v1/partner/staff/invitations',
      headers: auth(ownerBToken),
      payload: {
        email: customer.email,
        role: 'manager',
        hotelId: hotelA.id,
      },
    });
    expect(foreignInvite.statusCode).toBe(404);

    const unrelatedCustomer = await app.inject({
      method: 'GET',
      url: `/api/v1/partner/hotels/${hotelA.id}/staff`,
      headers: auth(customerToken),
    });
    expect(unrelatedCustomer.statusCode).toBe(404);

    const anonymous = await app.inject({
      method: 'GET',
      url: `/api/v1/partner/hotels/${hotelA.id}/staff`,
    });
    expect(anonymous.statusCode).toBe(401);

    const ownHotel = await app.inject({
      method: 'GET',
      url: `/api/v1/partner/hotels/${hotelB.id}/staff`,
      headers: auth(ownerBToken),
    });
    expect(ownHotel.statusCode).toBe(200);
    expect(ownHotel.json().data).toEqual([]);
  });

  it('revokes staff access and restores the customer role', async () => {
    const invitation = await testPrisma.hotelMembership.create({
      data: {
        hotelId: hotelA.id,
        userId: customer.id,
        role: 'manager',
        status: 'active',
        invitedBy: ownerA.id,
        acceptedAt: new Date(),
      },
    });
    await testPrisma.user.update({
      where: { id: customer.id },
      data: { role: 'hotel_staff' },
    });

    const revoke = await app.inject({
      method: 'DELETE',
      url: `/api/v1/partner/hotels/${hotelA.id}/staff/${invitation.id}`,
      headers: auth(ownerAToken),
    });
    expect(revoke.statusCode, revoke.body).toBe(204);

    const stored = await testPrisma.hotelMembership.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    expect(stored.status).toBe('revoked');
    const revocationAudit = await testPrisma.auditLog.findFirst({
      where: { action: 'staff_revoked', entityId: invitation.id },
    });
    expect(revocationAudit).not.toBeNull();

    const user = await testPrisma.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(user.role).toBe('customer');

    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/partner/hotels/${hotelA.id}/staff`,
      headers: auth(customerToken),
    });
    expect(denied.statusCode).toBe(404);
  });

  it('prevents revoking owners and self-revocation', async () => {
    const ownerMembership = await testPrisma.hotelMembership.findUniqueOrThrow({
      where: { hotelId_userId: { hotelId: hotelA.id, userId: ownerA.id } },
    });
    const ownerRevoke = await app.inject({
      method: 'DELETE',
      url: `/api/v1/partner/hotels/${hotelA.id}/staff/${ownerMembership.id}`,
      headers: auth(ownerAToken),
    });
    expect(ownerRevoke.statusCode).toBe(409);
    expect(ownerRevoke.json().error.code).toBe('CANNOT_REVOKE_OWNER');

    const managerMembership = await testPrisma.hotelMembership.create({
      data: {
        hotelId: hotelA.id,
        userId: ownerB.id,
        role: 'manager',
        status: 'active',
        acceptedAt: new Date(),
      },
    });
    const selfRevoke = await app.inject({
      method: 'DELETE',
      url: `/api/v1/partner/hotels/${hotelA.id}/staff/${managerMembership.id}`,
      headers: auth(ownerBToken),
    });
    expect(selfRevoke.statusCode).toBe(403);
  });

  it('allows platform admins to inspect any hotel', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/partner/hotels/${hotelA.id}/staff`,
      headers: auth(adminToken),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([]);
  });

  it('applies hotel permissions to manager and front-desk memberships', async () => {
    const manager = await createUser('manager@example.test', 'hotel_staff');
    const frontDesk = await createUser('front-desk@example.test', 'hotel_staff');
    await testPrisma.hotelMembership.createMany({
      data: [
        {
          hotelId: hotelA.id,
          userId: manager.id,
          role: 'manager',
          status: 'active',
          acceptedAt: new Date(),
        },
        {
          hotelId: hotelA.id,
          userId: frontDesk.id,
          role: 'front_desk',
          status: 'active',
          acceptedAt: new Date(),
        },
      ],
    });
    const managerToken = await createAccessToken(manager.id);
    const frontDeskToken = await createAccessToken(frontDesk.id);

    const managerList = await app.inject({
      method: 'GET',
      url: `/api/v1/partner/hotels/${hotelA.id}/staff`,
      headers: auth(managerToken),
    });
    expect(managerList.statusCode).toBe(200);

    const frontDeskList = await app.inject({
      method: 'GET',
      url: `/api/v1/partner/hotels/${hotelA.id}/staff`,
      headers: auth(frontDeskToken),
    });
    expect(frontDeskList.statusCode).toBe(403);
  });

  it('rejects invitations for unknown users and active memberships', async () => {
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/v1/partner/staff/invitations',
      headers: auth(ownerAToken),
      payload: {
        email: 'missing@example.test',
        role: 'finance_viewer',
        hotelId: hotelA.id,
      },
    });
    expect(unknown.statusCode).toBe(422);
    expect(unknown.json().error.code).toBe('INVITEE_NOT_FOUND');

    await testPrisma.hotelMembership.create({
      data: {
        hotelId: hotelA.id,
        userId: customer.id,
        role: 'finance_viewer',
        status: 'active',
        acceptedAt: new Date(),
      },
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/partner/staff/invitations',
      headers: auth(ownerAToken),
      payload: {
        email: customer.email,
        role: 'finance_viewer',
        hotelId: hotelA.id,
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('MEMBERSHIP_ACTIVE');
  });
});
