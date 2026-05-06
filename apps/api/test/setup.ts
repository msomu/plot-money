// Miniflare-backed test fixtures.
//
// Spins up a real D1 + R2 environment in-process, applies the migration SQL,
// and seeds two users (alice + bob) with realistic state for the auth /
// tenant / token / mcp tests:
//
//   alice: active subscription, two tokens (one valid, one revoked)
//   bob:   no subscription, one valid token
//
// Each call to setupTestEnv() returns a fresh Miniflare with empty D1, so
// suites stay independent. Caller MUST `await env.dispose()` in afterAll.

import { Miniflare } from 'miniflare';
import { hashToken } from '../src/lib/tokens.ts';

export const TEST_USERS = {
  alice: 'a0a0a0a0-0000-4000-8000-000000000001',
  bob: 'b0b0b0b0-0000-4000-8000-000000000002',
} as const;

export const TEST_ACCOUNTS = {
  alice: 'a1a1a1a1-0000-4000-8000-00000000a001',
  bob: 'b1b1b1b1-0000-4000-8000-00000000b001',
} as const;

export type TestEnv = {
  bindings: {
    DB: D1Database;
    FILES: R2Bucket;
    NODE_ENV: string;
    APP_URL: string;
    WEB_URL: string;
    ALLOWED_ORIGINS: string;
    APP_SECRET: string;
    BETTER_AUTH_SECRET: string;
    RAZORPAY_KEY_ID: string;
    RAZORPAY_KEY_SECRET: string;
  };
  fixtures: {
    aliceToken: string;
    bobToken: string;
    revokedToken: string;
  };
  dispose: () => Promise<void>;
};

const APP_SECRET = 'test_secret_'.padEnd(64, 'x');
const BETTER_AUTH_SECRET = 'better_auth_test_secret_'.padEnd(64, 'y');
const RAZORPAY_KEY_ID = 'rzp_test_unit';
const RAZORPAY_KEY_SECRET = 'razorpay_test_secret';

const MIGRATION_PATH = `${import.meta.dir}/../../../packages/shared/migrations/0000_init.sql`;

export async function setupTestEnv(): Promise<TestEnv> {
  const mf = new Miniflare({
    modules: true,
    // Empty handler — we only use this Miniflare instance for its bindings.
    script: 'export default { fetch: () => new Response("ok") };',
    d1Databases: ['DB'],
    r2Buckets: ['FILES'],
    bindings: {
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:8787',
      WEB_URL: 'http://localhost:5173',
      ALLOWED_ORIGINS: 'http://localhost:5173',
      APP_SECRET,
      BETTER_AUTH_SECRET,
      RAZORPAY_KEY_ID,
      RAZORPAY_KEY_SECRET,
    },
  });

  const env = (await mf.getBindings()) as TestEnv['bindings'];

  // Apply the schema. D1's exec() runs multi-statement SQL when the
  // statements are joined by `\n` — the `;` boundaries inside the file
  // are enough.
  const fs = await import('node:fs/promises');
  const sql = await fs.readFile(MIGRATION_PATH, 'utf8');
  // Drizzle's --> statement-breakpoint marker isn't valid SQL; strip it
  // and split on it so D1 can exec each statement individually.
  const statements = sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await env.DB.exec(stmt.replace(/\n/g, ' ').replace(/\s+/g, ' '));
  }

  // Seed users (no RLS — Better Auth tables).
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO users (id, email, name, email_verified) VALUES (?1, ?2, ?3, 1)',
    ).bind(TEST_USERS.alice, 'alice@test.plot.money', 'Alice Test'),
    env.DB.prepare(
      'INSERT INTO users (id, email, name, email_verified) VALUES (?1, ?2, ?3, 1)',
    ).bind(TEST_USERS.bob, 'bob@test.plot.money', 'Bob Test'),
  ]);

  // Seed accounts + transactions for both.
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO accounts (id, user_id, name, type, balance_paise) VALUES (?1, ?2, ?3, 'savings', 10000000)",
    ).bind(TEST_ACCOUNTS.alice, TEST_USERS.alice, 'Alice HDFC Savings'),
    env.DB.prepare(
      "INSERT INTO accounts (id, user_id, name, type, balance_paise) VALUES (?1, ?2, ?3, 'savings', 25000000)",
    ).bind(TEST_ACCOUNTS.bob, TEST_USERS.bob, 'Bob ICICI Salary'),
    env.DB.prepare(
      "INSERT INTO transactions (id, user_id, account_id, amount_paise, type, category, description, transaction_date) VALUES (?1, ?2, ?3, 45000, 'debit', 'groceries', 'Big Basket', '2026-04-28')",
    ).bind('t-alice-1', TEST_USERS.alice, TEST_ACCOUNTS.alice),
    env.DB.prepare(
      "INSERT INTO transactions (id, user_id, account_id, amount_paise, type, category, description, transaction_date) VALUES (?1, ?2, ?3, 120000, 'debit', 'food_delivery', 'Swiggy', '2026-04-29')",
    ).bind('t-bob-1', TEST_USERS.bob, TEST_ACCOUNTS.bob),
  ]);

  // Seed Alice's subscription as active.
  await env.DB.prepare(
    "INSERT INTO subscriptions (id, user_id, razorpay_subscription_id, status) VALUES (?1, ?2, 'sub_test_alice', 'active')",
  )
    .bind('sub-alice', TEST_USERS.alice)
    .run();

  // Mint three tokens (alice valid, alice revoked, bob valid). Raw tokens are
  // returned to the test; the DB only sees their hashes.
  const aliceToken = `plot_${randBase64(43)}`;
  const bobToken = `plot_${randBase64(43)}`;
  const revokedToken = `plot_${randBase64(43)}`;

  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO mcp_tokens (id, user_id, token_hash, name) VALUES (?1, ?2, ?3, ?4)',
    ).bind('tok-alice', TEST_USERS.alice, hashToken(aliceToken, APP_SECRET), 'alice-test'),
    env.DB.prepare(
      'INSERT INTO mcp_tokens (id, user_id, token_hash, name) VALUES (?1, ?2, ?3, ?4)',
    ).bind('tok-bob', TEST_USERS.bob, hashToken(bobToken, APP_SECRET), 'bob-test'),
    env.DB.prepare(
      "INSERT INTO mcp_tokens (id, user_id, token_hash, name, revoked_at) VALUES (?1, ?2, ?3, ?4, unixepoch('subsecond') * 1000)",
    ).bind(
      'tok-alice-revoked',
      TEST_USERS.alice,
      hashToken(revokedToken, APP_SECRET),
      'alice-revoked',
    ),
  ]);

  return {
    bindings: env,
    fixtures: { aliceToken, bobToken, revokedToken },
    dispose: () => mf.dispose(),
  };
}

function randBase64(len: number): string {
  const bytes = new Uint8Array(Math.ceil((len * 3) / 4));
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url').slice(0, len);
}
