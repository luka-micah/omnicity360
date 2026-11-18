// Authentication and user API contracts
import { UserRole } from '@hotel-marketplace/domain';
import { z } from 'zod';

import {
  isoDateSchema,
  uuidSchema,
  emailSchema,
  phoneNumberSchema,
  paginatedResponseSchema,
} from './common';

// Auth requests
export const registerRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: phoneNumberSchema.optional(),
  acceptTerms: z.literal(true),
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().optional(),
});

export const refreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutRequestSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .optional();

export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
});

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export const verifyEmailRequestSchema = z.object({
  token: z.string().min(1),
});

// Partner registration
export const partnerRegisterRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: phoneNumberSchema,
  companyName: z.string().min(1).max(255),
  companyRegistrationNumber: z.string().min(1).max(100).optional(),
  acceptTerms: z.literal(true),
});

// Profile
export const updateProfileRequestSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    phone: phoneNumberSchema.nullable().optional(),
    dateOfBirth: isoDateSchema.nullable().optional(),
    nationality: z.string().length(2).nullable().optional(),
    addressLine1: z.string().max(255).nullable().optional(),
    addressLine2: z.string().max(255).nullable().optional(),
    city: z.string().max(100).nullable().optional(),
    state: z.string().max(100).nullable().optional(),
    postalCode: z.string().max(20).nullable().optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

// Auth responses
export const tokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(), // seconds
  tokenType: z.literal('Bearer'),
});

export const userProfileSchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  firstName: z.string(),
  lastName: z.string(),
  phone: phoneNumberSchema.nullable(),
  role: z.nativeEnum(UserRole),
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const authResponseSchema = z.object({
  user: userProfileSchema,
  tokens: tokenPairSchema,
});

export const registerResponseSchema = authResponseSchema.extend({
  /** Development/test aid until an email provider is configured. Never returned in production. */
  devEmailVerificationToken: z.string().optional(),
});

export const forgotPasswordResponseSchema = z.object({
  message: z.string(),
  /** Development/test aid until an email provider is configured. Never returned in production. */
  devResetToken: z.string().optional(),
});

export const messageResponseSchema = z.object({
  message: z.string(),
});

export const verifyEmailResponseSchema = z.object({
  message: z.string(),
  emailVerified: z.literal(true),
});

// Customer and partner profiles
export const customerProfileSchema = z.object({
  dateOfBirth: z.string().nullable(),
  nationality: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string(),
  postalCode: z.string().nullable(),
  marketingOptIn: z.boolean(),
});

export const partnerProfileSchema = z.object({
  companyName: z.string(),
  companyRegistrationNumber: z.string().nullable(),
});

export const meProfileResponseSchema = z.object({
  user: userProfileSchema,
  customerProfile: customerProfileSchema.nullable(),
  partnerProfile: partnerProfileSchema.nullable(),
});

// Session
export const sessionSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  deviceInfo: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  current: z.boolean(),
});

export const sessionListResponseSchema = z.object({
  data: z.array(sessionSchema),
});

// Staff invitation and membership
export const staffRoleSchema = z.enum([
  'front_desk',
  'inventory_manager',
  'finance_viewer',
  'manager',
]);

export const membershipRoleSchema = z.enum([
  'owner',
  'manager',
  'front_desk',
  'inventory_manager',
  'finance_viewer',
]);

export const inviteStaffRequestSchema = z.object({
  email: emailSchema,
  role: staffRoleSchema,
  hotelId: uuidSchema,
});

export const acceptStaffInvitationRequestSchema = z.object({
  membershipId: uuidSchema,
});

export const staffMembershipSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  hotelId: uuidSchema,
  role: staffRoleSchema,
  invitedBy: uuidSchema.nullable(),
  status: z.enum(['pending', 'active', 'revoked']),
  createdAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
});

export const staffMemberSchema = staffMembershipSchema.extend({
  user: z.object({
    email: emailSchema,
    firstName: z.string(),
    lastName: z.string(),
  }),
});

export const staffListResponseSchema = paginatedResponseSchema(staffMemberSchema);

export const myMembershipSchema = z.object({
  id: uuidSchema,
  hotelId: uuidSchema,
  hotelName: z.string(),
  hotelSlug: z.string(),
  role: membershipRoleSchema,
  status: z.enum(['pending', 'active', 'revoked']),
  acceptedAt: z.string().datetime().nullable(),
});

export const myMembershipsResponseSchema = z.object({
  data: z.array(myMembershipSchema),
});

// Type exports
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;
export type PartnerRegisterRequest = z.infer<typeof partnerRegisterRequestSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type TokenPair = z.infer<typeof tokenPairSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type RegisterResponse = z.infer<typeof registerResponseSchema>;
export type ForgotPasswordResponse = z.infer<typeof forgotPasswordResponseSchema>;
export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type CustomerProfile = z.infer<typeof customerProfileSchema>;
export type PartnerProfile = z.infer<typeof partnerProfileSchema>;
export type MeProfileResponse = z.infer<typeof meProfileResponseSchema>;
export type InviteStaffRequest = z.infer<typeof inviteStaffRequestSchema>;
export type AcceptStaffInvitationRequest = z.infer<typeof acceptStaffInvitationRequestSchema>;
export type StaffMembership = z.infer<typeof staffMembershipSchema>;
export type StaffMember = z.infer<typeof staffMemberSchema>;
export type MyMembership = z.infer<typeof myMembershipSchema>;
