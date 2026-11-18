// Hotel API serializers. Dates become ISO strings; nullable optional columns are
// omitted so optional-but-not-nullable contract fields stay absent instead of null.
import type {
  AdminHotelListItem,
  AdminHotelResponse,
  HotelDocument as HotelDocumentDto,
  HotelMediaResponse,
  HotelResponse,
  HotelStatusHistoryEntry,
  PartnerHotelResponse,
} from '@hotel-marketplace/contracts';
import type { HotelStatus as DomainHotelStatus } from '@hotel-marketplace/domain';
import type { Hotel, HotelDocument, HotelMedia, HotelStatusHistory, User } from '@prisma/client';

type Partner = Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;

/** Hotel row with the relations every partner/admin detail response needs. */
export type HotelDetails = Hotel & {
  images: HotelMedia[];
  documents: HotelDocument[];
  statusHistory: HotelStatusHistory[];
};

/** Hotel row for admin list responses (counts instead of nested documents). */
export type HotelListRow = Hotel & {
  images: HotelMedia[];
  _count: { documents: number };
};

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function toHotelMedia(media: HotelMedia): HotelMediaResponse {
  return {
    id: media.id,
    url: media.url,
    ...(media.caption !== null ? { caption: media.caption } : {}),
    ...(media.altText !== null ? { altText: media.altText } : {}),
    sortOrder: media.sortOrder,
    ...(media.mimeType !== null ? { mimeType: media.mimeType } : {}),
    ...(media.width !== null ? { width: media.width } : {}),
    ...(media.height !== null ? { height: media.height } : {}),
    ...(media.sizeBytes !== null ? { sizeBytes: media.sizeBytes } : {}),
  };
}

export function toHotelDocument(document: HotelDocument): HotelDocumentDto {
  return {
    id: document.id,
    hotelId: document.hotelId,
    type: document.type as HotelDocumentDto['type'],
    url: document.url,
    description: document.description,
    verified: document.verified,
    verifiedBy: document.verifiedBy,
    verifiedAt: iso(document.verifiedAt),
    uploadedAt: document.uploadedAt.toISOString(),
  };
}

export function toHotelStatusHistory(entry: HotelStatusHistory): HotelStatusHistoryEntry {
  return {
    id: entry.id,
    hotelId: entry.hotelId,
    fromStatus: entry.fromStatus as unknown as DomainHotelStatus | null,
    toStatus: entry.toStatus as unknown as DomainHotelStatus,
    actorId: entry.actorId,
    actorType: entry.actorType,
    reason: entry.reason,
    notes: entry.notes,
    createdAt: entry.createdAt.toISOString(),
  };
}

export function toHotelResponse(hotel: Hotel, images: HotelMedia[]): HotelResponse {
  return {
    id: hotel.id,
    partnerId: hotel.partnerId,
    name: hotel.name,
    slug: hotel.slug,
    description: hotel.description,
    propertyType: hotel.propertyType,
    address: {
      line1: hotel.addressLine1,
      ...(hotel.addressLine2 !== null ? { line2: hotel.addressLine2 } : {}),
      city: hotel.city,
      state: hotel.state,
      country: hotel.country,
      ...(hotel.postalCode !== null ? { postalCode: hotel.postalCode } : {}),
      ...(hotel.latitude !== null && hotel.longitude !== null
        ? { coordinates: { latitude: hotel.latitude, longitude: hotel.longitude } }
        : {}),
    },
    contact: {
      ...(hotel.contactEmail !== null ? { email: hotel.contactEmail } : {}),
      ...(hotel.contactPhone !== null ? { phone: hotel.contactPhone } : {}),
      ...(hotel.contactWebsite !== null ? { website: hotel.contactWebsite } : {}),
    },
    checkInTime: hotel.checkInTime,
    checkOutTime: hotel.checkOutTime,
    amenities: hotel.amenities,
    houseRules: hotel.houseRules,
    accessibilityInfo: hotel.accessibilityInfo,
    images: images.map(toHotelMedia),
    status: hotel.status as unknown as DomainHotelStatus,
    rejectionReason: hotel.rejectionReason,
    defaultCommissionBps: hotel.defaultCommissionBps,
    submittedAt: iso(hotel.submittedAt),
    approvedAt: iso(hotel.approvedAt),
    approvedBy: hotel.approvedBy,
    suspendedAt: iso(hotel.suspendedAt),
    archivedAt: iso(hotel.archivedAt),
    createdAt: hotel.createdAt.toISOString(),
    updatedAt: hotel.updatedAt.toISOString(),
  };
}

export function toPartnerHotel(hotel: HotelDetails): PartnerHotelResponse {
  return {
    ...toHotelResponse(hotel, hotel.images),
    submissionNotes: hotel.submissionNotes,
    documents: hotel.documents.map(toHotelDocument),
    statusHistory: hotel.statusHistory.map(toHotelStatusHistory),
  };
}

function toPartnerSummary(partner: Partner): {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
} {
  return {
    id: partner.id,
    email: partner.email,
    firstName: partner.firstName,
    lastName: partner.lastName,
  };
}

export function toAdminHotel(hotel: HotelDetails, partner: Partner): AdminHotelResponse {
  return {
    ...toPartnerHotel(hotel),
    internalNotes: hotel.internalNotes,
    partner: toPartnerSummary(partner),
  };
}

export function toAdminHotelListItem(hotel: HotelListRow, partner: Partner): AdminHotelListItem {
  return {
    ...toHotelResponse(hotel, hotel.images),
    internalNotes: hotel.internalNotes,
    partner: toPartnerSummary(partner),
    documentCount: hotel._count.documents,
  };
}
