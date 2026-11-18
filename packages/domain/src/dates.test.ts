import { describe, expect, it } from 'vitest';

import {
  addDays,
  calculateNights,
  getDatesInRange,
  isDateInRange,
  nightsInRange,
  rangesOverlap,
  subtractDays,
  validateBookingDateRange,
  validateDateRange,
} from '../src/dates.js';
import { isoDate } from '../src/types/index.js';

const date = isoDate;

describe('dates', () => {
  describe('calculateNights', () => {
    it('uses check-in inclusive, check-out exclusive semantics', () => {
      // Dec 10 -> Dec 13 covers nights of 10, 11, 12 = 3 nights
      expect(calculateNights(date('2026-12-10'), date('2026-12-13'))).toBe(3);
    });

    it('returns 1 for a single night', () => {
      expect(calculateNights(date('2026-01-01'), date('2026-01-02'))).toBe(1);
    });

    it('handles leap day correctly', () => {
      expect(calculateNights(date('2028-02-28'), date('2028-03-01'))).toBe(2);
    });

    it('handles month and year boundaries', () => {
      expect(calculateNights(date('2026-12-31'), date('2027-01-02'))).toBe(2);
    });

    it('returns 0 when dates are equal', () => {
      expect(calculateNights(date('2026-05-01'), date('2026-05-01'))).toBe(0);
    });
  });

  describe('addDays / subtractDays', () => {
    it('adds days across month boundaries', () => {
      expect(addDays(date('2026-01-31'), 1)).toBe('2026-02-01');
    });

    it('subtracts days across year boundaries', () => {
      expect(subtractDays(date('2027-01-01'), 1)).toBe('2026-12-31');
    });

    it('handles leap years', () => {
      expect(addDays(date('2028-02-28'), 1)).toBe('2028-02-29');
    });
  });

  describe('range membership', () => {
    it('includes check-in date', () => {
      expect(
        isDateInRange(date('2026-06-10'), {
          checkIn: date('2026-06-10'),
          checkOut: date('2026-06-12'),
        })
      ).toBe(true);
    });

    it('excludes check-out date', () => {
      expect(
        isDateInRange(date('2026-06-12'), {
          checkIn: date('2026-06-10'),
          checkOut: date('2026-06-12'),
        })
      ).toBe(false);
    });

    it('lists each night in a range', () => {
      expect(
        getDatesInRange({ checkIn: date('2026-06-10'), checkOut: date('2026-06-13') })
      ).toEqual(['2026-06-10', '2026-06-11', '2026-06-12']);
    });
  });

  describe('overlap', () => {
    it('detects overlapping ranges', () => {
      expect(
        rangesOverlap(
          { checkIn: date('2026-06-10'), checkOut: date('2026-06-14') },
          { checkIn: date('2026-06-13'), checkOut: date('2026-06-16') }
        )
      ).toBe(true);
    });

    it('does not treat adjacent ranges as overlapping', () => {
      expect(
        rangesOverlap(
          { checkIn: date('2026-06-10'), checkOut: date('2026-06-13') },
          { checkIn: date('2026-06-13'), checkOut: date('2026-06-16') }
        )
      ).toBe(false);
    });
  });

  describe('validation', () => {
    it('rejects inverted ranges', () => {
      expect(() =>
        validateDateRange({ checkIn: date('2026-06-12'), checkOut: date('2026-06-10') })
      ).toThrow(/Check-out must be after check-in/);
    });

    it('rejects equal dates', () => {
      expect(() =>
        validateDateRange({ checkIn: date('2026-06-10'), checkOut: date('2026-06-10') })
      ).toThrow();
    });

    it('rejects stays beyond the configured maximum', () => {
      expect(() =>
        validateBookingDateRange({ checkIn: date('2030-01-01'), checkOut: date('2031-01-02') }, 365)
      ).toThrow();
    });
  });

  describe('nightsInRange', () => {
    it('delegates to calculateNights', () => {
      expect(nightsInRange({ checkIn: date('2026-03-01'), checkOut: date('2026-03-04') })).toBe(3);
    });
  });
});
