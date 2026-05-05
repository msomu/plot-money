// plot.money domain tables — SQLite/D1 dialect.
//
// Tenant isolation moves from Postgres RLS to the application layer via
// withTenant() in db.ts. Every table here MUST have user_id; that's the
// predicate the scoped client auto-injects on every read/write/delete.
//
// Money is stored as INTEGER paise (₹1.00 = 100). No floats anywhere in the
// data path — IEEE 754 and finance don't mix. Conversion to rupees happens
// only at the API boundary in the MCP tool handlers.

import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import {
  ACCOUNT_TYPES,
  CATEGORIES,
  SUBSCRIPTION_STATUSES,
  TRANSACTION_TYPES,
} from '../categories.ts';
import { users } from './auth.ts';

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
const newId = () => crypto.randomUUID();

const userIdRef = () =>
  text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    userId: userIdRef(),
    razorpaySubscriptionId: text('razorpay_subscription_id').notNull(),
    razorpayCustomerId: text('razorpay_customer_id'),
    status: text('status', { enum: SUBSCRIPTION_STATUSES }).notNull().default('created'),
    currentPeriodStart: integer('current_period_start', { mode: 'timestamp_ms' }),
    currentPeriodEnd: integer('current_period_end', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(nowMs)
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('subscriptions_razorpay_id_idx').on(t.razorpaySubscriptionId),
    index('subscriptions_user_id_idx').on(t.userId),
  ],
);

export const mcpTokens = sqliteTable(
  'mcp_tokens',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    userId: userIdRef(),
    tokenHash: text('token_hash').notNull().unique(),
    name: text('name').notNull(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
  },
  (t) => [index('mcp_tokens_user_id_idx').on(t.userId)],
);

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    userId: userIdRef(),
    name: text('name').notNull(),
    type: text('type', { enum: ACCOUNT_TYPES }).notNull(),
    currency: text('currency').notNull().default('INR'),
    // Paise. Denormalised, recomputed on transaction insert/update/delete.
    balancePaise: integer('balance_paise').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(nowMs)
      .$onUpdate(() => new Date()),
  },
  (t) => [index('accounts_user_id_idx').on(t.userId)],
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    userId: userIdRef(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    // Always positive paise. The `type` column tells you the direction.
    amountPaise: integer('amount_paise').notNull(),
    type: text('type', { enum: TRANSACTION_TYPES }).notNull(),
    category: text('category', { enum: CATEGORIES }).notNull(),
    description: text('description').notNull(),
    // ISO date string (YYYY-MM-DD). Storing as text keeps it stable across
    // timezones — we never want UTC drift on someone's "April 28th" txn.
    transactionDate: text('transaction_date').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(nowMs)
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('transactions_user_id_idx').on(t.userId),
    index('transactions_account_id_idx').on(t.accountId),
    index('transactions_date_idx').on(t.transactionDate),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type McpToken = typeof mcpTokens.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
