// API-facing serializers. Database dates are converted to ISO strings for OpenAPI clients.
import type {
  CustomerProfile as CustomerProfileDto,
  MeProfileResponse,
  PartnerProfile as PartnerProfileDto,
  Session,
  StaffMember,
  UserProfile,
} from '@hotel-marketplace/contracts';
import type { UserRole } from '@hotel-marketplace/domain';
import type {
  CustomerProfile,
  HotelMembership,
  PartnerProfile,
  User,
  UserSession,
} from '@prisma/client';

type UserWithProfiles = User & {
  customerProfile?: CustomerProfile | null;
  partnerProfile?: PartnerProfile | null;
};

export function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role as unknown as UserRole,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toCustomerProfile(profile: CustomerProfile): CustomerProfileDto {
  return {
    dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.toISOString().slice(0, 10) : null,
    nationality: profile.nationality,
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2,
    city: profile.city,
    state: profile.state,
    country: profile.country,
    postalCode: profile.postalCode,
    marketingOptIn: profile.marketingOptIn,
  };
}

export function toPartnerProfile(profile: PartnerProfile): PartnerProfileDto {
  return {
    companyName: profile.companyName,
    companyRegistrationNumber: profile.companyRegistrationNumber,
  };
}

export function toMeProfile(user: UserWithProfiles): MeProfileResponse {
  return {
    user: toUserProfile(user),
    customerProfile: user.customerProfile ? toCustomerProfile(user.customerProfile) : null,
    partnerProfile: user.partnerProfile ? toPartnerProfile(user.partnerProfile) : null,
  };
}

export function toSession(session: UserSession, currentSessionId: string): Session {
  return {
    id: session.id,
    userId: session.userId,
    deviceInfo: session.deviceInfo,
    ipAddress: session.ipAddress,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    current: session.id === currentSessionId,
  };
}

type MembershipWithUser = HotelMembership & {
  user: Pick<User, 'email' | 'firstName' | 'lastName'>;
};

export function toStaffMember(membership: MembershipWithUser): StaffMember {
  return {
    id: membership.id,
    userId: membership.userId,
    hotelId: membership.hotelId,
    role: membership.role as StaffMember['role'],
    invitedBy: membership.invitedBy,
    status: membership.status as StaffMember['status'],
    createdAt: membership.createdAt.toISOString(),
    acceptedAt: membership.acceptedAt ? membership.acceptedAt.toISOString() : null,
    user: {
      email: membership.user.email,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
    },
  };
}
