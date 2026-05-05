// D1-backed database client + tenant isolation.
//
// We lost Postgres RLS in the move to Cloudflare D1 (SQLite has no row
// level security). The replacement is *application-layer* isolation via
// the `tenant(userId)` helper below, which returns a per-table `eq(user_id, …)`
// predicate that EVERY query in tenant tables must include in its WHERE.
//
// Pattern:
//   const t = tenant(userId);
//   const rows = await db.select().from(schema.accounts).where(t.accounts);
//   const one  = await db.select().from(schema.accounts)
//     .where(and(t.accounts, eq(schema.accounts.id, accountId)));
//
// This is the same model Stripe / Linear / every Rails app on earth uses.
// It's not as defensively-deep as RLS — one missing `.where(t.x)` and a
// user sees another user's data. We compensate with:
//   1. The `tenant(...)` helper makes the predicate visually obvious in
//      every query, so it's catchable in review.
//   2. The MCP tool registry test in @plot-money/mcp-tools asserts every
//      handler's emitted SQL contains `user_id = ?`.
//   3. SECURITY.md flags this in scope for vuln reports.
//
// `withOwner` is gone — Drizzle on D1 just queries directly. `getDb()` /
// `closeDb()` are also gone — D1 bindings live on the request env in
// Workers, no module-level singleton needed.

import { eq } from 'drizzle-orm';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema/index.ts';

export type AppDB = DrizzleD1Database<typeof schema>;

/** Build a Drizzle client from a D1 binding. Cheap; safe to call per request. */
export function makeDb(binding: D1Database): AppDB {
  return drizzle(binding, { schema });
}

/**
 * Tenant predicates for the four user-scoped tables. Returned as ready-to-use
 * Drizzle expressions; combine with other predicates via `and(...)`.
 */
export function tenant(userId: string) {
  return {
    userId,
    accounts: eq(schema.accounts.userId, userId),
    transactions: eq(schema.transactions.userId, userId),
    mcpTokens: eq(schema.mcpTokens.userId, userId),
    subscriptions: eq(schema.subscriptions.userId, userId),
  } as const;
}

export type TenantPredicates = ReturnType<typeof tenant>;

/**
 * Convenience wrapper for handlers that prefer a callback shape. Identical
 * semantics to calling `tenant(userId)` directly — exists so handler call
 * sites read like the old `withRls(userId, fn)` pattern they're replacing.
 */
export async function withTenant<T>(
  db: AppDB,
  userId: string,
  fn: (db: AppDB, t: TenantPredicates) => Promise<T>,
): Promise<T> {
  return fn(db, tenant(userId));
}
