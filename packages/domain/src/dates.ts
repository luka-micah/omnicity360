/**
 * Date utilities for hotel booking domain
 * All dates stored as UTC ISO strings
 */

import type { ISODateString, ISODateTimeString, DateRange } from './types';

export const DATE_FORMAT = 'yyyy-MM-dd';
export const DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSSxxx";

/** Parse a date string in YYYY-MM-DD format to Date (UTC) */
export function parseDate(dateStr: ISODateString): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) {
    throw new Error(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}

/** Parse a datetime string to Date */
export function parseDateTime(dateTimeStr: ISODateTimeString): Date {
  const date = new Date(dateTimeStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid datetime format: ${dateTimeStr}`);
  }
  return date;
}

/** Format a Date as YYYY-MM-DD (UTC) */
export function formatDate(date: Date): ISODateString {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}` as ISODateString;
}

/** Format a Date as ISO datetime string (UTC) */
export function formatDateTime(date: Date): ISODateTimeString {
  return date.toISOString() as ISODateTimeString;
}

/** Get current date as YYYY-MM-DD (UTC) */
export function today(): ISODateString {
  return formatDate(new Date());
}

/** Get current datetime as ISO string (UTC) */
export function now(): ISODateTimeString {
  return formatDateTime(new Date());
}

/** Add days to a date string */
export function addDays(dateStr: ISODateString, days: number): ISODateString {
  const date = parseDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

/** Subtract days from a date string */
export function subtractDays(dateStr: ISODateString, days: number): ISODateString {
  return addDays(dateStr, -days);
}

/** Calculate number of nights between check-in (inclusive) and check-out (exclusive) */
export function calculateNights(checkIn: ISODateString, checkOut: ISODateString): number {
  const checkInDate = parseDate(checkIn);
  const checkOutDate = parseDate(checkOut);
  const diffMs = checkOutDate.getTime() - checkInDate.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/** Calculate nights from a DateRange */
export function nightsInRange(range: DateRange): number {
  return calculateNights(range.checkIn, range.checkOut);
}

/** Check if a date is within a range (check-in inclusive, check-out exclusive) */
export function isDateInRange(date: ISODateString, range: DateRange): boolean {
  return date >= range.checkIn && date < range.checkOut;
}

/** Check if two date ranges overlap */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}

/** Get all dates in a range (inclusive start, exclusive end) */
export function getDatesInRange(range: DateRange): ISODateString[] {
  const dates: ISODateString[] = [];
  let current = range.checkIn;
  while (current < range.checkOut) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

/** Validate that check-out is after check-in */
export function validateDateRange(range: DateRange): void {
  if (range.checkIn >= range.checkOut) {
    throw new Error('Check-out must be after check-in');
  }
}

/** Validate that a date is not in the past (relative to today UTC) */
export function validateNotPastDate(date: ISODateString, fieldName = 'Date'): void {
  if (date < today()) {
    throw new Error(`${fieldName} cannot be in the past`);
  }
}

/** Validate that check-in is not in the past */
export function validateCheckInNotPast(checkIn: ISODateString): void {
  validateNotPastDate(checkIn, 'Check-in');
}

/** Check if a date range is valid for booking (future dates, reasonable limits) */
export function validateBookingDateRange(range: DateRange, maxStayNights = 365): void {
  validateDateRange(range);
  validateCheckInNotPast(range.checkIn);
  const nights = nightsInRange(range);
  if (nights <= 0) {
    throw new Error('Stay must be at least 1 night');
  }
  if (nights > maxStayNights) {
    throw new Error(`Stay cannot exceed ${maxStayNights} nights`);
  }
}

/** Get start of day in UTC */
export function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Get end of day in UTC */
export function endOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
  );
}

/** Check if two datetimes are on the same day (UTC) */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Generate a booking reference (human-readable, opaque) */
export function generateBookingReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `BK-${timestamp}-${random}`;
}

/** Generate a payment reference */
export function generatePaymentReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PAY-${timestamp}-${random}`;
}

/** Generate a payout reference */
export function generatePayoutReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PAYOUT-${timestamp}-${random}`;
}

/** Generate an idempotency key */
export function generateIdempotencyKey(prefix = 'idem'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 12);
  return `${prefix}-${timestamp}-${random}`;
}
