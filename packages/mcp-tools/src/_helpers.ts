// Money + date helpers shared across tools.
//
// We use plain JavaScript numbers for arithmetic. Personal finance amounts
// (rupees, two decimal places) sit comfortably inside Number.MAX_SAFE_INTEGER
// even when multiplied by paise — INR balances above ~9 quadrillion are
// not a v0.1 concern.

import { AppError } from '@plot-money/shared';

export function parseAmount(decimal: string | number): number {
  const n = typeof decimal === 'string' ? Number(decimal) : decimal;
  if (!Number.isFinite(n)) {
    throw new AppError('VALIDATION_ERROR', `Invalid amount: ${decimal}`);
  }
  return n;
}

export function formatAmount(n: number): string {
  return n.toFixed(2);
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Convert a Date -> 'YYYY-MM-DD' (UTC). */
export function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Validate a YYYY-MM-DD date string. Returns a Date set to midnight UTC.
 * Rejects future dates beyond `today` per the MCP spec validation rules.
 */
export function parseTransactionDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError('VALIDATION_ERROR', `transaction_date must be YYYY-MM-DD, got: ${value}`);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new AppError('VALIDATION_ERROR', `transaction_date is not a real date: ${value}`);
  }
  const todayUtc = new Date(`${todayIsoDate()}T23:59:59Z`);
  if (d.getTime() > todayUtc.getTime()) {
    throw new AppError('VALIDATION_ERROR', `transaction_date cannot be in the future: ${value}`);
  }
  return d;
}

/** YYYY-MM-DD inclusive range checker for filter inputs. */
export function parseRangeDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError('VALIDATION_ERROR', `${field} must be YYYY-MM-DD, got: ${value}`);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new AppError('VALIDATION_ERROR', `${field} is not a real date: ${value}`);
  }
  return d;
}
