// Validation helpers shared across tools.
//
// Money in tool I/O is decimal rupees. Storage is integer paise (see
// _money.ts). Transaction dates are TEXT 'YYYY-MM-DD' in the DB so users
// never lose timezone fights — "2026-04-28" means the same calendar day
// regardless of whether the user is in Mumbai or Bangalore.

import { AppError } from '@plot-money/shared';

export function parseRupeeAmount(decimal: string | number): number {
  const n = typeof decimal === 'string' ? Number(decimal) : decimal;
  if (!Number.isFinite(n)) {
    throw new AppError('VALIDATION_ERROR', `Invalid amount: ${decimal}`);
  }
  if (n <= 0) {
    throw new AppError('VALIDATION_ERROR', `Amount must be > 0, got: ${decimal}`);
  }
  return n;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Validate a YYYY-MM-DD transaction date string per the MCP spec rules.
 * Rejects future dates beyond today. Returns the canonical string for
 * storage in `transactions.transaction_date` (TEXT column).
 */
export function parseTransactionDate(value: string): string {
  validateDateShape(value, 'transaction_date');
  if (value > todayIsoDate()) {
    throw new AppError('VALIDATION_ERROR', `transaction_date cannot be in the future: ${value}`);
  }
  return value;
}

/** YYYY-MM-DD validator for date-range filter inputs. Returns the string. */
export function parseRangeDate(value: string, field: string): string {
  validateDateShape(value, field);
  return value;
}

function validateDateShape(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError('VALIDATION_ERROR', `${field} must be YYYY-MM-DD, got: ${value}`);
  }
  // Round-trip through Date to catch bogus values like 2026-13-40.
  const t = new Date(`${value}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) {
    throw new AppError('VALIDATION_ERROR', `${field} is not a real date: ${value}`);
  }
}
