// Seed two test users with one account + one transaction each.
//
// Idempotent: deletes any existing rows with the seeded IDs before
// inserting. Designed to run against a *dev* database — never in production.
//
// Usage:
//   DATABASE_URL=... bun run scripts/seed-test.ts

import { drizzle } from 'drizzle-orm/postgres-js';
import { sql as rawSql, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../src/schema/index.ts';

export const TEST_USERS = {
  alice: '00000000-0000-4000-8000-000000000001',
  bob: '00000000-0000-4000-8000-000000000002',
} as const;

export const TEST_ACCOUNTS = {
  alice: '00000000-0000-4000-8000-00000000a001',
  bob: '00000000-0000-4000-8000-00000000b001',
} as const;

export async function seed(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { ssl: 'require', max: 1 });
  const db = drizzle(sql, { schema });

  try {
    // Cleanup: drop any prior test rows. As the owner (BYPASSRLS), we can
    // delete across users in one go without setting the GUC.
    await db.delete(schema.transactions);
    await db.delete(schema.accounts);
    await db.delete(schema.users).where(inArray(schema.users.id, Object.values(TEST_USERS)));

    // Users (no RLS on this table — Better Auth's domain).
    await db.insert(schema.users).values([
      { id: TEST_USERS.alice, email: 'alice@test.plot.money', name: 'Alice Test' },
      { id: TEST_USERS.bob, email: 'bob@test.plot.money', name: 'Bob Test' },
    ]);

    // Tenant rows: insert under the plot_app role with the matching GUC so
    // the WITH CHECK clause passes. Mirrors how the API will operate.
    for (const [name, userId] of Object.entries(TEST_USERS)) {
      const accountId = TEST_ACCOUNTS[name as keyof typeof TEST_ACCOUNTS];
      const isAlice = name === 'alice';
      await db.transaction(async (tx) => {
        await tx.execute(rawSql`SET LOCAL ROLE plot_app`);
        await tx.execute(rawSql`SELECT set_config('app.current_user_id', ${userId}, true)`);
        await tx.insert(schema.accounts).values({
          id: accountId,
          userId,
          name: isAlice ? 'Alice HDFC Savings' : 'Bob ICICI Salary',
          type: 'savings',
          balance: isAlice ? '100000.00' : '250000.00',
        });
        await tx.insert(schema.transactions).values({
          userId,
          accountId,
          amount: isAlice ? '450.00' : '1200.00',
          type: 'debit',
          category: isAlice ? 'groceries' : 'food_delivery',
          description: isAlice ? 'Big Basket' : 'Swiggy',
          transactionDate: new Date(isAlice ? '2026-04-28' : '2026-04-29'),
        });
      });
    }
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  await seed(url);
  console.log('Seeded test users:', Object.keys(TEST_USERS).join(', '));
}
