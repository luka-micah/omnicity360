export type UserRole =
  'guest' | 'customer' | 'hotel_owner' | 'hotel_staff' | 'platform_support' | 'platform_admin';

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: UserRole;
  emailVerified: boolean;
}

export interface AuthResponse {
  user: UserProfile;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: 'Bearer';
  };
}

export interface HotelAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  postalCode?: string;
}

export interface HotelDocument {
  id: string;
  type: 'cac_certificate' | 'tax_clearance' | 'fire_safety' | 'business_permit' | 'other';
  url: string;
  description: string | null;
  verified: boolean;
}

export interface Hotel {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  propertyType: string;
  address: HotelAddress;
  contact: { email?: string; phone?: string; website?: string };
  checkInTime: string;
  checkOutTime: string;
  amenities: string[];
  images: Array<{ id: string; url: string; caption?: string }>;
  status:
    'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'suspended' | 'archived';
  rejectionReason: string | null;
  submittedAt: string | null;
  documents: HotelDocument[];
  statusHistory: Array<{
    id: string;
    fromStatus: Hotel['status'] | null;
    toStatus: Hotel['status'];
    notes: string | null;
    reason: string | null;
    createdAt: string;
  }>;
}

export interface PartnerHotel extends Hotel {
  submissionNotes: string | null;
}

export interface AdminHotel extends Hotel {
  internalNotes: string | null;
  partner: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  documentCount: number;
}

export type AdminHotelListItem = Omit<AdminHotel, 'documents' | 'statusHistory'>;

export interface PageResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Money {
  amount: number;
  currency: 'NGN' | 'USD' | 'EUR' | 'GBP';
}

export interface HotelSearchResult {
  hotelId: string;
  hotelName: string;
  hotelSlug: string;
  propertyType: string;
  city: string;
  address: { line1: string; city: string; state: string; country: string };
  images: Array<{ url: string; caption?: string }>;
  minPrice: Money;
  maxPrice: Money;
  currency: string;
  availableRoomCategories: Array<{
    id: string;
    name: string;
    slug: string;
    maxAdults: number;
    maxChildren: number;
    baseRate: Money;
    availableQuantity: number;
    inventoryMode: 'category_quantity' | 'physical_rooms';
    ratePlans: Array<{ id: string; name: string; type: string; price: Money }>;
  }>;
  description: string | null;
  amenities: string[];
  rating: number | null;
  reviewCount: number | null;
}

export interface Quote {
  roomCategoryId: string;
  roomCategoryName: string;
  ratePlanId: string;
  ratePlanName: string;
  ratePlanType: string;
  nights: number;
  rooms: number;
  nightlyRates: Array<{
    date: string;
    rate: Money;
    ratePlanId: string;
    ratePlanName: string;
  }>;
  subtotal: Money;
  discounts: Array<{ name: string; amount: Money; fundedBy: 'hotel' | 'platform' }>;
  taxes: Array<{ name: string; amount: Money; rateBps: number }>;
  mandatoryFees: Array<{ name: string; amount: Money }>;
  optionalExtras: Array<{ id: string; name: string; amount: Money; selected: boolean }>;
  total: Money;
  cancellationPolicy: {
    id: string;
    name: string;
    description: string;
    freeCancellationUntil: string | null;
    refundPercent: number | null;
  };
  commissionBps: number;
  quoteId: string;
  expiresAt: string;
  createdAt: string;
}

export interface PendingBooking {
  id: string;
  reference: string;
  accessToken: string;
  status: 'pending_payment';
  hotelName: string;
  checkIn: string;
  checkOut: string;
  pricingSnapshot: { total: Money };
  holdExpiresAt: string | null;
}
