/**
 * State machines for core domain entities.
 * Defines valid transitions; enforcement happens in services.
 */

import { BookingStatus, HotelStatus, PaymentStatus } from './types';

/** Booking state machine */
export const BookingStateMachine = {
  initial: BookingStatus.PENDING_PAYMENT,

  transitions: {
    [BookingStatus.PENDING_PAYMENT]: [
      BookingStatus.CONFIRMED,
      BookingStatus.EXPIRED,
      BookingStatus.MANUAL_REVIEW,
    ],
    [BookingStatus.CONFIRMED]: [
      BookingStatus.CHECKED_IN,
      BookingStatus.CANCELLED,
      BookingStatus.NO_SHOW,
      BookingStatus.MANUAL_REVIEW,
    ],
    [BookingStatus.CHECKED_IN]: [
      BookingStatus.CHECKED_OUT,
      BookingStatus.NO_SHOW,
      BookingStatus.MANUAL_REVIEW,
    ],
    [BookingStatus.CHECKED_OUT]: [BookingStatus.COMPLETED, BookingStatus.MANUAL_REVIEW],
    [BookingStatus.COMPLETED]: [],
    [BookingStatus.CANCELLATION_REQUESTED]: [BookingStatus.CANCELLED, BookingStatus.CONFIRMED],
    [BookingStatus.CANCELLED]: [],
    [BookingStatus.EXPIRED]: [BookingStatus.MANUAL_REVIEW],
    [BookingStatus.NO_SHOW]: [BookingStatus.COMPLETED, BookingStatus.MANUAL_REVIEW],
    [BookingStatus.MANUAL_REVIEW]: [
      BookingStatus.CONFIRMED,
      BookingStatus.CANCELLED,
      BookingStatus.COMPLETED,
      BookingStatus.NO_SHOW,
    ],
  } satisfies Record<BookingStatus, readonly BookingStatus[]>,

  canTransition(from: BookingStatus, to: BookingStatus): boolean {
    return (this.transitions[from] as readonly (typeof from)[]).includes(to);
  },

  getNextStates(from: BookingStatus): readonly BookingStatus[] {
    return this.transitions[from];
  },

  isTerminal(state: BookingStatus): boolean {
    return this.transitions[state].length === 0;
  },

  /** Active bookings can be operationally modified by the hotel. */
  isActive(state: BookingStatus): boolean {
    return state === BookingStatus.CONFIRMED || state === BookingStatus.CHECKED_IN;
  },

  isConfirmedOrBeyond(state: BookingStatus): boolean {
    return (
      state === BookingStatus.CONFIRMED ||
      state === BookingStatus.CHECKED_IN ||
      state === BookingStatus.CHECKED_OUT ||
      state === BookingStatus.COMPLETED
    );
  },

  /** Inventory stays reserved until cancellation/expiry/check-out. */
  holdsInventory(state: BookingStatus): boolean {
    return (
      state === BookingStatus.PENDING_PAYMENT ||
      state === BookingStatus.CONFIRMED ||
      state === BookingStatus.CHECKED_IN
    );
  },

  canCustomerCancel(state: BookingStatus): boolean {
    return state === BookingStatus.PENDING_PAYMENT || state === BookingStatus.CONFIRMED;
  },

  canCheckIn(state: BookingStatus): boolean {
    return state === BookingStatus.CONFIRMED;
  },

  canCheckOut(state: BookingStatus): boolean {
    return state === BookingStatus.CHECKED_IN;
  },

  canMarkNoShow(state: BookingStatus): boolean {
    return state === BookingStatus.CONFIRMED || state === BookingStatus.CHECKED_IN;
  },
} as const;

/** Payment state machine */
export const PaymentStateMachine = {
  initial: PaymentStatus.INITIALIZED,

  transitions: {
    [PaymentStatus.INITIALIZED]: [
      PaymentStatus.PENDING,
      PaymentStatus.FAILED,
      PaymentStatus.EXPIRED,
      PaymentStatus.ABANDONED,
    ],
    [PaymentStatus.PENDING]: [
      PaymentStatus.PROCESSING,
      PaymentStatus.FAILED,
      PaymentStatus.EXPIRED,
      PaymentStatus.ABANDONED,
    ],
    [PaymentStatus.PROCESSING]: [
      PaymentStatus.SUCCEEDED,
      PaymentStatus.FAILED,
      PaymentStatus.DISPUTED,
    ],
    [PaymentStatus.SUCCEEDED]: [
      PaymentStatus.REFUND_PENDING,
      PaymentStatus.PARTIALLY_REFUNDED,
      PaymentStatus.REFUNDED,
      PaymentStatus.DISPUTED,
    ],
    [PaymentStatus.FAILED]: [PaymentStatus.PENDING],
    [PaymentStatus.ABANDONED]: [],
    [PaymentStatus.EXPIRED]: [PaymentStatus.PENDING],
    [PaymentStatus.REFUND_PENDING]: [
      PaymentStatus.PARTIALLY_REFUNDED,
      PaymentStatus.REFUNDED,
      PaymentStatus.FAILED,
    ],
    [PaymentStatus.PARTIALLY_REFUNDED]: [PaymentStatus.REFUND_PENDING, PaymentStatus.REFUNDED],
    [PaymentStatus.REFUNDED]: [],
    [PaymentStatus.DISPUTED]: [
      PaymentStatus.SUCCEEDED,
      PaymentStatus.REFUNDED,
      PaymentStatus.FAILED,
    ],
  } satisfies Record<PaymentStatus, readonly PaymentStatus[]>,

  canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
    return (this.transitions[from] as readonly (typeof from)[]).includes(to);
  },

  getNextStates(from: PaymentStatus): readonly PaymentStatus[] {
    return this.transitions[from];
  },

  isTerminal(state: PaymentStatus): boolean {
    return this.transitions[state].length === 0;
  },

  isSuccessful(state: PaymentStatus): boolean {
    return state === PaymentStatus.SUCCEEDED;
  },

  isFailed(state: PaymentStatus): boolean {
    return (
      state === PaymentStatus.FAILED ||
      state === PaymentStatus.ABANDONED ||
      state === PaymentStatus.EXPIRED
    );
  },

  isRefunded(state: PaymentStatus): boolean {
    return state === PaymentStatus.REFUNDED || state === PaymentStatus.PARTIALLY_REFUNDED;
  },

  canRefund(state: PaymentStatus): boolean {
    return state === PaymentStatus.SUCCEEDED || state === PaymentStatus.PARTIALLY_REFUNDED;
  },
} as const;

/** Hotel status state machine */
export const HotelStateMachine = {
  initial: HotelStatus.DRAFT,

  transitions: {
    [HotelStatus.DRAFT]: [HotelStatus.SUBMITTED, HotelStatus.ARCHIVED],
    [HotelStatus.SUBMITTED]: [HotelStatus.UNDER_REVIEW, HotelStatus.DRAFT],
    [HotelStatus.UNDER_REVIEW]: [HotelStatus.APPROVED, HotelStatus.REJECTED, HotelStatus.SUBMITTED],
    [HotelStatus.APPROVED]: [HotelStatus.SUSPENDED, HotelStatus.ARCHIVED],
    // A rejected partner fixes the issues and resubmits directly; `canSubmit` allows
    // draft or rejected, so the transition table must agree with that rule.
    [HotelStatus.REJECTED]: [HotelStatus.SUBMITTED, HotelStatus.DRAFT, HotelStatus.ARCHIVED],
    [HotelStatus.SUSPENDED]: [HotelStatus.APPROVED, HotelStatus.ARCHIVED],
    [HotelStatus.ARCHIVED]: [],
  } satisfies Record<HotelStatus, readonly HotelStatus[]>,

  canTransition(from: HotelStatus, to: HotelStatus): boolean {
    return (this.transitions[from] as readonly (typeof from)[]).includes(to);
  },

  getNextStates(from: HotelStatus): readonly HotelStatus[] {
    return this.transitions[from];
  },

  isTerminal(state: HotelStatus): boolean {
    return this.transitions[state].length === 0;
  },

  isBookable(state: HotelStatus): boolean {
    return state === HotelStatus.APPROVED;
  },

  canSubmit(state: HotelStatus): boolean {
    return state === HotelStatus.DRAFT || state === HotelStatus.REJECTED;
  },

  canApprove(state: HotelStatus): boolean {
    return state === HotelStatus.UNDER_REVIEW;
  },

  canReject(state: HotelStatus): boolean {
    return state === HotelStatus.UNDER_REVIEW;
  },

  canSuspend(state: HotelStatus): boolean {
    return state === HotelStatus.APPROVED;
  },
} as const;

interface StateMachineLike<T extends string> {
  transitions: Record<T, readonly T[]>;
  canTransition: (from: T, to: T) => boolean;
  getNextStates: (from: T) => readonly T[];
}

/** Validate a transition, throwing a descriptive error when invalid. */
export function validateTransition<T extends string>(
  machine: StateMachineLike<T>,
  from: T,
  to: T,
  context?: string
): void {
  if (!machine.canTransition(from, to)) {
    const valid = machine.getNextStates(from).join(', ');
    throw new Error(
      `Invalid ${context ? context + ' ' : ''}state transition: ${from} -> ${to}. Valid transitions: ${valid || 'none'}`
    );
  }
}

/** Assert that the current state permits an operation. */
export function assertState<T extends string>(
  state: T,
  allowedStates: readonly T[],
  operation: string
): void {
  if (!allowedStates.includes(state)) {
    throw new Error(
      `Cannot ${operation} in state ${state}. Allowed states: ${allowedStates.join(', ')}`
    );
  }
}
