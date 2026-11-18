// Hotel lifecycle transitions: conditional updates, status history, and audit.
import {
  HotelStateMachine,
  type AuditAction,
  type HotelStatus as DomainHotelStatus,
} from '@hotel-marketplace/domain';
import type { Hotel, HotelStatus, Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';

import { writeAuditLog } from '../auth/audit.js';
import { ConflictError, UnauthorizedError } from '../errors/index.js';

export type HotelTx = Prisma.TransactionClient;

/** Prisma and domain both model hotel status with the same string values. */
function asDomainStatus(status: HotelStatus): DomainHotelStatus {
  return status as unknown as DomainHotelStatus;
}

/** Statuses where partners may edit content (including media and documents). */
export const PARTNER_EDITABLE_HOTEL_STATUSES: readonly HotelStatus[] = [
  'draft',
  'rejected',
  'approved',
  'suspended',
];

export function isPartnerEditable(status: HotelStatus): boolean {
  return PARTNER_EDITABLE_HOTEL_STATUSES.includes(status);
}

/** Draft and rejected hotels may be resubmitted; `HotelStateMachine.canSubmit` agrees. */
export function canSubmitHotel(status: HotelStatus): boolean {
  return HotelStateMachine.canSubmit(asDomainStatus(status));
}

/** Reject content edits while a submission is with reviewers or once archived. */
export function assertPartnerEditable(hotel: Hotel): void {
  if (hotel.status === 'archived') {
    throw new ConflictError('HOTEL_ARCHIVED', 'Archived hotels cannot be edited');
  }
  if (!isPartnerEditable(hotel.status)) {
    throw new ConflictError(
      'HOTEL_LOCKED_FOR_REVIEW',
      'Hotel content is locked while the submission is under review'
    );
  }
}

export interface HotelTransitionInput {
  hotel: Hotel;
  to: HotelStatus;
  /** Extra scalar columns to set alongside the status change. */
  data?: Omit<Prisma.HotelUpdateManyMutationInput, 'status'>;
  action: AuditAction;
  reason?: string | null;
  notes?: string | null;
  severity?: 'info' | 'warning' | 'critical';
  metadata?: Prisma.InputJsonObject;
}

/**
 * Apply a hotel status transition atomically. The conditional update guarantees
 * only one concurrent request wins; every successful transition writes a
 * HotelStatusHistory row and an audit entry in the same transaction.
 */
export async function applyHotelTransition(
  tx: HotelTx,
  request: FastifyRequest,
  input: HotelTransitionInput
): Promise<void> {
  const auth = request.auth;
  if (!auth) throw new UnauthorizedError();

  const from = input.hotel.status;
  if (!HotelStateMachine.canTransition(asDomainStatus(from), asDomainStatus(input.to))) {
    throw new ConflictError(
      'HOTEL_INVALID_TRANSITION',
      `Hotel cannot move from ${from} to ${input.to}`
    );
  }

  const result = await tx.hotel.updateMany({
    where: { id: input.hotel.id, status: from },
    data: {
      status: input.to,
      updatedAt: new Date(),
      ...(input.data ?? {}),
    },
  });

  if (result.count === 0) {
    throw new ConflictError(
      'HOTEL_STATUS_CONFLICT',
      'Hotel status changed while this request was processing; reload and try again'
    );
  }

  await tx.hotelStatusHistory.create({
    data: {
      hotelId: input.hotel.id,
      fromStatus: from,
      toStatus: input.to,
      actorId: auth.user.id,
      actorType: 'user',
      reason: input.reason ?? null,
      notes: input.notes ?? null,
    },
  });

  await writeAuditLog(tx, request, {
    actorId: auth.user.id,
    actorType: auth.user.role,
    actorEmail: auth.user.email,
    action: input.action,
    entityType: 'hotel',
    entityId: input.hotel.id,
    oldValues: { status: from },
    newValues: { status: input.to },
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.severity ? { severity: input.severity } : {}),
  });
}

/**
 * Append an internal review note with an ISO timestamp prefix so successive
 * admin notes stay readable without overwriting earlier context.
 */
export function appendInternalNote(
  existing: string | null,
  actorEmail: string,
  note: string | undefined
): string | null {
  if (!note) return existing;
  const line = `[${new Date().toISOString()}] ${actorEmail}: ${note}`;
  return existing ? `${existing}\n${line}` : line;
}
