import { describe, expect, it } from 'vitest';

import {
  addMoney,
  allocateMoney,
  applyDiscount,
  calculateCommission,
  calculateNetPayable,
  calculatePercentage,
  compareMoney,
  createMoney,
  createMoneyFromMajor,
  formatMoney,
  isZero,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  toMajorUnits,
  CURRENCY_DECIMAL_PLACES,
} from '../src/money.js';
import { basisPoints, currencyCode } from '../src/types/index.js';

const NGN = currencyCode('NGN');

describe('money', () => {
  describe('createMoney', () => {
    it('accepts integer minor units', () => {
      expect(createMoney(10050, NGN)).toEqual({ amount: 10050, currency: 'NGN' });
    });

    it('rejects non-integer amounts', () => {
      expect(() => createMoney(10.5, NGN)).toThrow(/integer/);
    });

    it('rejects negative amounts', () => {
      expect(() => createMoney(-1, NGN)).toThrow(/negative/);
    });

    it('rejects unsupported currency', () => {
      expect(() => createMoney(100, 'XYZ' as typeof NGN)).toThrow(/Unsupported currency/);
    });
  });

  describe('major/minor conversions', () => {
    it('converts major to minor without floating point drift', () => {
      expect(createMoneyFromMajor(45000, NGN).amount).toBe(4_500_000);
      expect(createMoneyFromMajor(0.1 + 0.2, NGN).amount).toBe(30);
    });

    it('converts minor to major', () => {
      expect(toMajorUnits(createMoney(4_500_000, NGN))).toBe(45_000);
    });

    it('declares decimal places for supported currencies', () => {
      expect(CURRENCY_DECIMAL_PLACES.get(NGN)).toBe(2);
    });
  });

  describe('arithmetic', () => {
    it('adds same-currency amounts', () => {
      expect(addMoney(createMoney(1000, NGN), createMoney(250, NGN)).amount).toBe(1250);
    });

    it('rejects cross-currency addition', () => {
      expect(() => addMoney(createMoney(1000, NGN), createMoney(250, currencyCode('USD')))).toThrow(
        /Currency mismatch/
      );
    });

    it('subtracts when sufficient balance', () => {
      expect(subtractMoney(createMoney(1000, NGN), createMoney(250, NGN)).amount).toBe(750);
    });

    it('rejects subtraction below zero', () => {
      expect(() => subtractMoney(createMoney(100, NGN), createMoney(250, NGN))).toThrow(
        /Insufficient/
      );
    });

    it('multiplies and rounds to nearest minor unit', () => {
      expect(multiplyMoney(createMoney(999, NGN), 1.5).amount).toBe(1499);
    });

    it('sums arrays of amounts', () => {
      expect(sumMoney([createMoney(100, NGN), createMoney(200, NGN)]).amount).toBe(300);
    });

    it('rejects summing empty arrays', () => {
      expect(() => sumMoney([])).toThrow(/empty/);
    });

    it('compares amounts', () => {
      expect(compareMoney(createMoney(100, NGN), createMoney(200, NGN))).toBe(-1);
      expect(compareMoney(createMoney(200, NGN), createMoney(200, NGN))).toBe(0);
      expect(compareMoney(createMoney(300, NGN), createMoney(200, NGN))).toBe(1);
    });

    it('identifies zero', () => {
      expect(isZero(createMoney(0, NGN))).toBe(true);
    });
  });

  describe('percentage and commission', () => {
    it('calculates 10% commission with rounding', () => {
      expect(calculateCommission(createMoney(4_500_000, NGN), basisPoints(1000)).amount).toBe(
        450_000
      );
    });

    it('calculates 12.5% commission', () => {
      expect(calculateCommission(createMoney(10_000, NGN), basisPoints(1250)).amount).toBe(1250);
    });

    it('rejects out-of-range basis points', () => {
      expect(() => basisPoints(10001)).toThrow();
      expect(() => basisPoints(-1)).toThrow();
      expect(() => basisPoints(10.5)).toThrow();
    });

    it('calculates net payable after commission', () => {
      expect(calculateNetPayable(createMoney(100_000, NGN), basisPoints(1000)).amount).toBe(90_000);
    });

    it('applies discounts', () => {
      expect(applyDiscount(createMoney(100_000, NGN), basisPoints(500)).amount).toBe(95_000);
    });

    it('calculates generic percentages', () => {
      expect(calculatePercentage(createMoney(20_000, NGN), basisPoints(750)).amount).toBe(1500);
    });
  });

  describe('allocation', () => {
    it('allocates exactly without losing minor units', () => {
      const parts = allocateMoney(createMoney(1000, NGN), [1, 1, 1]);
      expect(parts.map((p) => p.amount)).toEqual([333, 333, 334]);
      expect(parts.reduce((sum, p) => sum + p.amount, 0)).toBe(1000);
    });

    it('allocates proportional amounts', () => {
      const parts = allocateMoney(createMoney(1000, NGN), [3, 1]);
      expect(parts.map((p) => p.amount)).toEqual([750, 250]);
    });

    it('rejects invalid allocation input', () => {
      expect(() => allocateMoney(createMoney(1000, NGN), [])).toThrow();
      expect(() => allocateMoney(createMoney(1000, NGN), [0, 0])).toThrow();
      expect(() => allocateMoney(createMoney(1000, NGN), [-1, 2])).toThrow();
    });
  });

  describe('formatting', () => {
    it('formats NGN currency', () => {
      const formatted = formatMoney(createMoney(4_500_000, NGN));
      expect(formatted).toContain('45,000');
      expect(formatted).toContain('₦');
    });
  });
});
