import type {
  AdminHotel,
  AdminHotelListItem,
  AuthResponse,
  HotelSearchResult,
  PageResponse,
  PendingBooking,
  PartnerHotel,
  Quote,
} from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1').replace(
  /\/$/,
  ''
);

interface ApiOptions extends Omit<RequestInit, 'headers'> {
  token?: string | null;
  headers?: HeadersInit;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function apiRequest(path: string, options?: ApiOptions): Promise<void>;
export function apiRequest<T>(path: string, options?: ApiOptions): Promise<T>;
export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T | void> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ApiError(
        `Could not connect to the booking API at ${API_BASE_URL}. For local development, start the API with "pnpm dev" and make sure its database is configured.`,
        0
      );
    }
    throw error;
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body: unknown = await response.json();
      if (
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof body.error === 'object' &&
        body.error !== null &&
        'message' in body.error &&
        typeof body.error.message === 'string'
      ) {
        message = body.error.message;
      }
    } catch {
      message = `The server returned an unreadable error (${response.status})`;
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return;
  return (await response.json()) as T;
}

export function login(email: string, password: string, rememberMe: boolean): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, rememberMe }),
  });
}

export function registerCustomer(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  acceptTerms: true;
}): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function registerPartner(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
  acceptTerms: true;
}): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/partner/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function refreshSession(): Promise<AuthResponse> {
  refreshRequest ??= apiRequest<AuthResponse>('/auth/refresh', { method: 'POST' }).finally(() => {
    refreshRequest = null;
  });
  return refreshRequest;
}

let refreshRequest: Promise<AuthResponse> | null = null;

export function revokeSession(token: string): Promise<void> {
  return apiRequest('/auth/logout', {
    method: 'POST',
    token,
  });
}

export function searchHotels(input: {
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
}): Promise<PageResponse<HotelSearchResult>> {
  return apiRequest<PageResponse<HotelSearchResult>>('/hotels/search', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getQuote(input: {
  hotelId: string;
  roomCategoryId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
}): Promise<Quote> {
  return apiRequest<Quote>('/quotes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createBooking(
  input: {
    quoteId: string;
    idempotencyKey: string;
    guests: Array<{
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      isPrimary: true;
    }>;
    rooms: Array<{
      roomCategoryId: string;
      ratePlanId: string;
      adults: number;
      children: number;
      quantity: number;
    }>;
  },
  token?: string | null
): Promise<PendingBooking> {
  return apiRequest<PendingBooking>('/bookings', {
    method: 'POST',
    ...(token ? { token } : {}),
    body: JSON.stringify(input),
  });
}

export async function getPartnerHotels(token: string): Promise<PartnerHotel[]> {
  const response = await apiRequest<PageResponse<PartnerHotel>>(
    '/partner/hotels?page=1&limit=100',
    {
      token,
    }
  );
  return response.data;
}

export interface HotelCreateInput {
  name: string;
  description?: string;
  propertyType: string;
  address: HotelAddressInput;
  contact: { email?: string; phone?: string; website?: string };
  checkInTime: string;
  checkOutTime: string;
  amenities: string[];
}

export interface HotelUpdateInput extends Partial<Omit<HotelCreateInput, 'address' | 'contact'>> {
  address?: Partial<HotelAddressInput>;
  contact?: Partial<HotelCreateInput['contact']>;
}

export function createHotel(token: string, input: HotelCreateInput): Promise<PartnerHotel> {
  return apiRequest<PartnerHotel>('/partner/hotels', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

export function updateHotel(
  token: string,
  hotelId: string,
  input: HotelUpdateInput
): Promise<PartnerHotel> {
  return apiRequest<PartnerHotel>(`/partner/hotels/${hotelId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(input),
  });
}

export interface HotelAddressInput {
  line1: string;
  city: string;
  state: string;
  country: 'NG';
}

export function submitHotel(
  token: string,
  hotelId: string,
  input: {
    documents: Array<{
      type: HotelDocumentType;
      url: string;
      description?: string;
    }>;
  }
): Promise<PartnerHotel> {
  return apiRequest<PartnerHotel>(`/partner/hotels/${hotelId}/submit`, {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

export type HotelDocumentType =
  'cac_certificate' | 'tax_clearance' | 'fire_safety' | 'business_permit' | 'other';

export async function getAdminHotels(token: string, status: string): Promise<AdminHotelListItem[]> {
  const query = new URLSearchParams({ page: '1', limit: '100', status });
  const response = await apiRequest<PageResponse<AdminHotelListItem>>(`/admin/hotels?${query}`, {
    token,
  });
  return response.data;
}

export function getAdminHotel(token: string, hotelId: string): Promise<AdminHotel> {
  return apiRequest<AdminHotel>(`/admin/hotels/${hotelId}`, { token });
}

export function startHotelReview(token: string, hotelId: string): Promise<AdminHotel> {
  return apiRequest<AdminHotel>(`/admin/hotels/${hotelId}/review`, {
    method: 'POST',
    token,
    body: JSON.stringify({}),
  });
}

export function approveHotel(token: string, hotelId: string): Promise<AdminHotel> {
  return apiRequest<AdminHotel>(`/admin/hotels/${hotelId}/approve`, {
    method: 'POST',
    token,
    body: JSON.stringify({}),
  });
}

export function rejectHotel(
  token: string,
  hotelId: string,
  rejectionReason: string
): Promise<AdminHotel> {
  return apiRequest<AdminHotel>(`/admin/hotels/${hotelId}/reject`, {
    method: 'POST',
    token,
    body: JSON.stringify({ rejectionReason }),
  });
}
