/**
 * Money utilities - pure functions for financial calculations.
 * All amounts are integer minor units (kobo for NGN).
 */

import type { Money, CurrencyCode, BasisPoints } from './types';
import { SUPPORTED_CURRENCIES, currencyCode } from './types';

export const CURRENCY_DECIMAL_PLACES: ReadonlyMap<CurrencyCode, number> = new Map([
  ['NGN', 2],
  ['USD', 2],
  ['EUR', 2],
  ['GBP', 2],
]);

export function validateCurrency(currency: string): asserts currency is CurrencyCode {
  if (!SUPPORTED_CURRENCIES.includes(currency as CurrencyCode)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
}

export function createMoney(amount: number, currency: CurrencyCode): Money {
  validateCurrency(currency);
  if (!Number.isInteger(amount)) {
    throw new Error('Money amount must be an integer (minor units)');
  }
  if (amount < 0) {
    throw new Error('Money amount cannot be negative');
  }
  return { amount, currency };
}

export function createMoneyFromMajor(major: number, currency: CurrencyCode): Money {
  validateCurrency(currency);
  if (major < 0) {
    throw new Error('Money amount cannot be negative');
  }
  const decimals = CURRENCY_DECIMAL_PLACES.get(currency) ?? 2;
  const multiplier = Math.pow(10, decimals);
  const amount = Math.round(major * multiplier);
  return { amount, currency: currencyCode(currency) };
}

export function toMajorUnits(m: Money): number {
  const decimals = CURRENCY_DECIMAL_PLACES.get(m.currency) ?? 2;
  const divisor = Math.pow(10, decimals);
  return m.amount / divisor;
}

export function formatMoney(m: Money, locale = 'en-NG'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
    minimumFractionDigits: CURRENCY_DECIMAL_PLACES.get(m.currency) ?? 2,
    maximumFractionDigits: CURRENCY_DECIMAL_PLACES.get(m.currency) ?? 2,
  }).format(toMajorUnits(m));
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  return createMoney(a.amount + b.amount, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  if (a.amount < b.amount) {
    throw new Error('Insufficient funds');
  }
  return createMoney(a.amount - b.amount, a.currency);
}

export function multiplyMoney(m: Money, factor: number): Money {
  if (factor < 0) {
    throw new Error('Multiplication factor cannot be negative');
  }
  return createMoney(Math.round(m.amount * factor), m.currency);
}

export function divideMoney(m: Money, divisor: number): Money {
  if (divisor <= 0) {
    throw new Error('Divisor must be positive');
  }
  return createMoney(Math.round(m.amount / divisor), m.currency);
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  return a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0;
}

export function isZero(m: Money): boolean {
  return m.amount === 0;
}

export function isPositive(m: Money): boolean {
  return m.amount > 0;
}

export function sumMoney(amounts: Money[]): Money {
  const [first, ...rest] = amounts;
  if (!first) {
    throw new Error('Cannot sum empty array');
  }
  for (const m of rest) {
    if (m.currency !== first.currency) {
      throw new Error(`Currency mismatch in sum: ${m.currency} vs ${first.currency}`);
    }
  }
  const total = rest.reduce((acc, m) => acc + m.amount, first.amount);
  return createMoney(total, first.currency);
}

export function allocateMoney(total: Money, parts: number[]): Money[] {
  if (parts.length === 0) {
    throw new Error('Cannot allocate to zero parts');
  }
  if (parts.some((p) => p < 0)) {
    throw new Error('Allocation parts cannot be negative');
  }
  const sumParts = parts.reduce((a, b) => a + b, 0);
  if (sumParts === 0) {
    throw new Error('Sum of allocation parts must be positive');
  }

  const results: Money[] = [];
  let remaining = total.amount;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] ?? 0;
    const partAmount = Math.round((total.amount * part) / sumParts);
    results.push(createMoney(partAmount, total.currency));
    remaining -= partAmount;
  }

  // Last part receives the remainder so the allocation is exact.
  results.push(createMoney(remaining, total.currency));
  return results;
}

export function calculatePercentage(amount: Money, rate: BasisPoints): Money {
  if (rate < 0 || rate > 10000) {
    throw new Error('Basis points must be between 0 and 10000');
  }
  const result = Math.round((amount.amount * rate) / 10000);
  return createMoney(result, amount.currency);
}

export function applyDiscount(amount: Money, discountBps: BasisPoints): Money {
  const discount = calculatePercentage(amount, discountBps);
  return subtractMoney(amount, discount);
}

export function calculateTax(amount: Money, taxRateBps: BasisPoints): Money {
  return calculatePercentage(amount, taxRateBps);
}

export function calculateCommission(amount: Money, commissionRateBps: BasisPoints): Money {
  return calculatePercentage(amount, commissionRateBps);
}

export function calculateNetPayable(grossAmount: Money, commissionRateBps: BasisPoints): Money {
  const commission = calculateCommission(grossAmount, commissionRateBps);
  return subtractMoney(grossAmount, commission);
}
