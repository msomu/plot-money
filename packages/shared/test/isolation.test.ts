// Tenant isolation under RLS.
//
// These tests prove the FORCE ROW LEVEL SECURITY policy on the four app
// tables actually keeps users out of each other's data. They run against
// the live dev database (Neon), so DATABASE_URL must be set.
//
// Strategy: seed two users, open a transaction that does
//   SET LOCAL ROLE plot_app;
//   SELECT set_config('app.current_user_id', '<uuid>', true);
// then verify reads only return that user's rows and writes for the other
// user are blocked by the policy's WITH CHECK clause. Without the GUC set,
// every read returns zero rows (fail closed).

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql as rawSql, eq } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../src/schema/index.ts';
import { seed, TEST_USERS, TEST_ACCOUNTS } from '../scripts/seed-test.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  throw new Error('DATABASE_URL must be set to run isolation tests');
}

let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

beforeAll(async () => {
  await seed(url!);
  sql = postgres(url!, { ssl: 'require', max: 2 });
  db = drizzle(sql, { schema });
});

afterAll(async () => {
  await sql.end();
});

async function asUser<T>(
  userId: string,
  fn: (tx: PostgresJsDatabase<typeof schema>) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(rawSql`SET LOCAL ROLE plot_app`);
    await tx.execute(rawSql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    return fn(tx as unknown as PostgresJsDatabase<typeof schema>);
  });
}

async function asNobody<T>(fn: (tx: PostgresJsDatabase<typeof schema>) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(rawSql`SET LOCAL ROLE plot_app`);
    return fn(tx as unknown as PostgresJsDatabase<typeof schema>);
  });
}

describe('RLS tenant isolation', () => {
  test('user A only sees their own accounts', async () => {
    const rows = await asUser(TEST_USERS.alice, (tx) => tx.select().from(schema.accounts));
    expect(rows.length).toBe(1);
    expect(rows[0]!.userId).toBe(TEST_USERS.alice);
  });

  test('user B only sees their own accounts', async () => {
    const rows = await asUser(TEST_USERS.bob, (tx) => tx.select().from(schema.accounts));
    expect(rows.length).toBe(1);
    expect(rows[0]!.userId).toBe(TEST_USERS.bob);
  });

  test('user A cannot read user B accounts even by ID', async () => {
    const rows = await asUser(TEST_USERS.alice, (tx) =>
      tx.select().from(schema.accounts).where(eq(schema.accounts.id, TEST_ACCOUNTS.bob)),
    );
    expect(rows.length).toBe(0);
  });

  test('user A cannot insert a row owned by user B', async () => {
    let caught: { code?: string; message?: string } | undefined;
    try {
      await asUser(TEST_USERS.alice, (tx) =>
        tx.insert(schema.accounts).values({
          userId: TEST_USERS.bob,
          name: 'Sneaky',
          type: 'savings',
        }),
      );
    } catch (err) {
      // drizzle wraps the postgres error — the real one is on .cause.
      const cause = (err as { cause?: { code?: string; message?: string } }).cause;
      caught = cause ?? { message: String(err) };
    }
    expect(caught).toBeDefined();
    expect(caught!.code).toBe('42501');
    expect(caught!.message).toMatch(/row-level security/i);
  });

  test('user A cannot delete user B transactions', async () => {
    const result = await asUser(TEST_USERS.alice, (tx) =>
      tx
        .delete(schema.transactions)
        .where(eq(schema.transactions.userId, TEST_USERS.bob))
        .returning(),
    );
    expect(result.length).toBe(0);

    const bobsTxns = await asUser(TEST_USERS.bob, (tx) => tx.select().from(schema.transactions));
    expect(bobsTxns.length).toBe(1);
  });

  test('without GUC set, reads return zero rows (fail closed)', async () => {
    const accountRows = await asNobody((tx) => tx.select().from(schema.accounts));
    const txnRows = await asNobody((tx) => tx.select().from(schema.transactions));
    const tokenRows = await asNobody((tx) => tx.select().from(schema.mcpTokens));
    const subRows = await asNobody((tx) => tx.select().from(schema.subscriptions));
    expect(accountRows.length).toBe(0);
    expect(txnRows.length).toBe(0);
    expect(tokenRows.length).toBe(0);
    expect(subRows.length).toBe(0);
  });
});
