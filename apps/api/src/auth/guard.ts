// Authentication, role, permission, and tenant guards.
import { UserRole } from '@hotel-marketplace/domain';
import type { Hotel, HotelMembership, User, UserRole as PrismaUserRole } from '@prisma/client';
import type { FastifyRequest } from 'fastify';

import { prisma } from '../db/prisma.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../errors/index.js';

import { verifyAccessToken } from './tokens.js';

export interface AuthContext {
  user: User;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export const HOTEL_ROLES = [
  'owner',
  'manager',
  'front_desk',
  'inventory_manager',
  'finance_viewer',
] as const;
export type HotelRole = (typeof HOTEL_ROLES)[number];

export type HotelPermission =
  | 'manage_hotel'
  | 'manage_staff'
  | 'manage_inventory'
  | 'manage_rates'
  | 'manage_bookings'
  | 'view_finance';

const ROLE_PERMISSIONS: Record<HotelRole, readonly HotelPermission[]> = {
  owner: [
    'manage_hotel',
    'manage_staff',
    'manage_inventory',
    'manage_rates',
    'manage_bookings',
    'view_finance',
  ],
  manager: ['manage_staff', 'manage_inventory', 'manage_rates', 'manage_bookings', 'view_finance'],
  front_desk: ['manage_bookings'],
  inventory_manager: ['manage_inventory', 'manage_rates'],
  finance_viewer: ['view_finance'],
};

const PLATFORM_ROLE_PERMISSIONS: Partial<Record<UserRole, readonly HotelPermission[]>> = {
  [UserRole.PLATFORM_ADMIN]: [
    'manage_hotel',
    'manage_staff',
    'manage_inventory',
    'manage_rates',
    'manage_bookings',
    'view_finance',
  ],
};

export function isHotelRole(value: string): value is HotelRole {
  return (HOTEL_ROLES as readonly string[]).includes(value);
}

export function rolePermissions(role: string): readonly HotelPermission[] {
  return isHotelRole(role) ? ROLE_PERMISSIONS[role] : [];
}

export function can(userRole: string, permissions: readonly HotelPermission[]): boolean {
  const platformPermissions = PLATFORM_ROLE_PERMISSIONS[userRole as UserRole] ?? [];
  return permissions.every((permission) => platformPermissions.includes(permission));
}

export async function authenticate(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication required');
  }

  const claims = await verifyAccessToken(header.slice('Bearer '.length).trim());
  const session = await prisma.userSession.findUnique({
    where: { id: claims.sessionId },
    include: { user: true },
  });

  const now = new Date();
  if (
    !session ||
    session.userId !== claims.userId ||
    session.revokedAt !== null ||
    session.expiresAt <= now ||
    !session.user.isActive
  ) {
    throw new UnauthorizedError('Authentication required');
  }

  request.auth = { user: session.user, sessionId: session.id };
}

export function requireRoles(...roles: UserRole[]) {
  return async function roleGuard(request: FastifyRequest): Promise<void> {
    if (!request.auth) throw new UnauthorizedError('Authentication required');
    const role = request.auth.user.role as PrismaUserRole;
    if (!roles.some((allowed) => allowed === role)) {
      throw new ForbiddenError('Access denied');
    }
  };
}

export interface HotelAccess {
  hotel: Hotel;
  membership: HotelMembership | null;
  effectiveRole: HotelRole | 'platform_admin';
  permissions: readonly HotelPermission[];
}

/**
 * Resolves hotel access from ownership or an active membership. Platform admins bypass
 * tenant restrictions. Unauthorized users receive 404 so they cannot enumerate hotel IDs.
 */
export async function requireHotelAccess(
  request: FastifyRequest,
  hotelId: string
): Promise<HotelAccess> {
  if (!request.auth) throw new UnauthorizedError('Authentication required');

  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    include: {
      memberships: {
        where: { userId: request.auth.user.id, status: 'active' },
        take: 1,
      },
    },
  });
  if (!hotel) throw new NotFoundError('Hotel');

  const { user } = request.auth;
  if (user.role === 'platform_admin') {
    return {
      hotel,
      membership: hotel.memberships[0] ?? null,
      effectiveRole: 'platform_admin',
      permissions: PLATFORM_ROLE_PERMISSIONS[UserRole.PLATFORM_ADMIN] ?? [],
    };
  }
  if (hotel.partnerId === user.id) {
    return {
      hotel,
      membership: hotel.memberships[0] ?? null,
      effectiveRole: 'owner',
      permissions: ROLE_PERMISSIONS.owner,
    };
  }

  const membership = hotel.memberships[0];
  if (!membership || !isHotelRole(membership.role)) {
    throw new NotFoundError('Hotel');
  }
  return {
    hotel,
    membership,
    effectiveRole: membership.role,
    permissions: ROLE_PERMISSIONS[membership.role],
  };
}

export function requireHotelPermission(access: HotelAccess, permission: HotelPermission): void {
  if (!access.permissions.includes(permission)) {
    throw new ForbiddenError('You do not have permission to perform this action');
  }
}
