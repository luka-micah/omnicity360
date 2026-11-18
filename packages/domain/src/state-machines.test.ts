import { describe, expect, it } from 'vitest';

import {
  BookingStateMachine,
  HotelStateMachine,
  PaymentStateMachine,
  assertState,
  validateTransition,
} from '../src/state-machines.js';

describe('booking state machine', () => {
  it('starts in pending_payment', () => {
    expect(BookingStateMachine.initial).toBe('pending_payment');
  });

  it('allows pending_payment -> confirmed', () => {
    expect(BookingStateMachine.canTransition('pending_payment', 'confirmed')).toBe(true);
  });

  it('allows pending_payment -> expired', () => {
    expect(BookingStateMachine.canTransition('pending_payment', 'expired')).toBe(true);
  });

  it('does not allow pending_payment -> checked_in directly', () => {
    expect(BookingStateMachine.canTransition('pending_payment', 'checked_in')).toBe(false);
  });

  it('does not allow confirmed -> completed directly', () => {
    expect(BookingStateMachine.canTransition('confirmed', 'completed')).toBe(false);
  });

  it('treats cancelled and completed as terminal', () => {
    expect(BookingStateMachine.isTerminal('cancelled')).toBe(true);
    expect(BookingStateMachine.isTerminal('completed')).toBe(true);
    expect(BookingStateMachine.isTerminal('confirmed')).toBe(false);
  });

  it('holds inventory while pending or confirmed', () => {
    expect(BookingStateMachine.holdsInventory('pending_payment')).toBe(true);
    expect(BookingStateMachine.holdsInventory('confirmed')).toBe(true);
    expect(BookingStateMachine.holdsInventory('cancelled')).toBe(false);
    expect(BookingStateMachine.holdsInventory('expired')).toBe(false);
  });

  it('only permits customer cancellation before check-in', () => {
    expect(BookingStateMachine.canCustomerCancel('confirmed')).toBe(true);
    expect(BookingStateMachine.canCustomerCancel('checked_in')).toBe(false);
  });

  it('only permits check-in from confirmed', () => {
    expect(BookingStateMachine.canCheckIn('confirmed')).toBe(true);
    expect(BookingStateMachine.canCheckIn('pending_payment')).toBe(false);
  });

  it('only permits check-out from checked_in', () => {
    expect(BookingStateMachine.canCheckOut('checked_in')).toBe(true);
    expect(BookingStateMachine.canCheckOut('confirmed')).toBe(false);
  });

  it('validates transitions with a clear error', () => {
    expect(() =>
      validateTransition(BookingStateMachine, 'cancelled', 'confirmed', 'booking')
    ).toThrow(/Invalid booking state transition/);
  });
});

describe('payment state machine', () => {
  it('starts initialized', () => {
    expect(PaymentStateMachine.initial).toBe('initialized');
  });

  it('requires server-verified flow to reach succeeded', () => {
    expect(PaymentStateMachine.canTransition('initialized', 'succeeded')).toBe(false);
    expect(PaymentStateMachine.canTransition('pending', 'succeeded')).toBe(false);
    expect(PaymentStateMachine.canTransition('processing', 'succeeded')).toBe(true);
  });

  it('treats refunded as terminal', () => {
    expect(PaymentStateMachine.isTerminal('refunded')).toBe(true);
    expect(PaymentStateMachine.isTerminal('succeeded')).toBe(false);
  });

  it('only refunds successful or partially refunded payments', () => {
    expect(PaymentStateMachine.canRefund('succeeded')).toBe(true);
    expect(PaymentStateMachine.canRefund('partially_refunded')).toBe(true);
    expect(PaymentStateMachine.canRefund('pending')).toBe(false);
    expect(PaymentStateMachine.canRefund('failed')).toBe(false);
  });
});

describe('hotel state machine', () => {
  it('starts as draft', () => {
    expect(HotelStateMachine.initial).toBe('draft');
  });

  it('only approved hotels are bookable', () => {
    expect(HotelStateMachine.isBookable('approved')).toBe(true);
    expect(HotelStateMachine.isBookable('draft')).toBe(false);
    expect(HotelStateMachine.isBookable('suspended')).toBe(false);
    expect(HotelStateMachine.isBookable('under_review')).toBe(false);
  });

  it('requires review before approval', () => {
    expect(HotelStateMachine.canApprove('under_review')).toBe(true);
    expect(HotelStateMachine.canApprove('draft')).toBe(false);
    expect(HotelStateMachine.canApprove('submitted')).toBe(false);
  });

  it('can suspend approved hotels only', () => {
    expect(HotelStateMachine.canSuspend('approved')).toBe(true);
    expect(HotelStateMachine.canSuspend('draft')).toBe(false);
  });
});

describe('assertState', () => {
  it('passes when state is allowed', () => {
    expect(() => assertState('confirmed', ['confirmed', 'checked_in'], 'check out')).not.toThrow();
  });

  it('throws a descriptive error otherwise', () => {
    expect(() => assertState('pending_payment', ['confirmed'], 'check in')).toThrow(
      /Cannot check in in state pending_payment/
    );
  });
});
