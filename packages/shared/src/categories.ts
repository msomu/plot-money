// Hardcoded transaction category list for v0.1. Extending this requires a
// migration (it's a Postgres enum). User-defined categories deferred to v0.2.

export const CATEGORIES = [
  'groceries',
  'food_delivery',
  'dining',
  'transport',
  'fuel',
  'rent',
  'utilities',
  'internet',
  'phone',
  'salary',
  'freelance',
  'business_income',
  'sip',
  'mutual_fund_purchase',
  'mutual_fund_sale',
  'stock_purchase',
  'stock_sale',
  'dividend',
  'interest',
  'upi_transfer_in',
  'upi_transfer_out',
  'shopping',
  'healthcare',
  'entertainment',
  'subscriptions',
  'gifts',
  'taxes',
  'insurance',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const ACCOUNT_TYPES = [
  'savings',
  'current',
  'credit_card',
  'cash',
  'mutual_fund',
  'stock',
  'fd',
  'other',
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TRANSACTION_TYPES = ['debit', 'credit'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const SUBSCRIPTION_STATUSES = [
  'created',
  'authenticated',
  'active',
  'paused',
  'cancelled',
  'expired',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(value);
}
