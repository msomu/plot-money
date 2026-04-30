// plot.money domain tables.
//
// Every table here MUST have user_id and is governed by the tenant_isolation
// RLS policy created in the custom migration. The app role queries with
// `SET LOCAL app.current_user_id = '<uuid>'` per request.

import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { numeric } from 'drizzle-orm/pg-core';
import {
  ACCOUNT_TYPES,
  CATEGORIES,
  SUBSCRIPTION_STATUSES,
  TRANSACTION_TYPES,
} from '../categories.ts';
import { users } from './auth.ts';

// Postgres enums kept in sync with the TS const arrays in categories.ts.
export const accountTypeEnum = pgEnum('account_type', ACCOUNT_TYPES);
export const transactionTypeEnum = pgEnum('transaction_type', TRANSACTION_TYPES);
export const categoryEnum = pgEnum('category', CATEGORIES);
export const subscriptionStatusEnum = pgEnum('subscription_status', SUBSCRIPTION_STATUSES);

const userIdRef = () =>
  text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: userIdRef(),
    razorpaySubscriptionId: text('razorpay_subscription_id').notNull(),
    razorpayCustomerId: text('razorpay_customer_id'),
    status: subscriptionStatusEnum('status').notNull().default('created'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('subscriptions_razorpay_id_idx').on(t.razorpaySubscriptionId),
    index('subscriptions_user_id_idx').on(t.userId),
  ],
);

export const mcpTokens = pgTable(
  'mcp_tokens',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: userIdRef(),
    tokenHash: text('token_hash').notNull().unique(),
    name: text('name').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('mcp_tokens_user_id_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: userIdRef(),
    name: text('name').notNull(),
    type: accountTypeEnum('type').notNull(),
    currency: text('currency').notNull().default('INR'),
    // Denormalised, recomputed on transaction insert/update/delete.
    // Stored as numeric(20,2) — paise-precision rupees up to a few quadrillion.
    balance: numeric('balance', { precision: 20, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('accounts_user_id_idx').on(t.userId)],
);

export const transactions = pgTable(
  'transactions',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: userIdRef(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    // Always positive. The `type` column tells you the direction.
    amount: numeric('amount', { precision: 20, scale: 2 }).notNull(),
    type: transactionTypeEnum('type').notNull(),
    category: categoryEnum('category').notNull(),
    description: text('description').notNull(),
    transactionDate: timestamp('transaction_date', { withTimezone: false, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
