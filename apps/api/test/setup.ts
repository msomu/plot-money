// Test fixtures: two users, two MCP tokens (one active sub, one inactive),
// one revoked token. Idempotent — wipes the seeded rows on each run.

import { sql as rawSql, eq } from 'drizzle-orm';
import { initDb, schema, withOwner } from '@plot-money/shared';
import { seed, TEST_USERS, TEST_ACCOUNTS } from '@plot-money/shared/test-fixtures';
import { hashToken } from '../src/lib/tokens.ts';

export { TEST_USERS, TEST_ACCOUNTS };

export type Fixtures = {
  /** Raw token for alice — alice has an `active` subscription. */
  aliceToken: string;
  /** Raw token for bob — bob has NO subscription row. */
  bobToken: string;
  /** Raw token for alice that has been revoked. */
  revokedToken: string;
};

export async function setupFixtures(databaseUrl: string, appSecret: string): Promise<Fixtures> {
  initDb(databaseUrl);
  await seed(databaseUrl);

  const aliceToken = `plot_${randomBase64(43)}`;
  const bobToken = `plot_${randomBase64(43)}`;
  const revokedToken = `plot_${randomBase64(43)}`;

  await withOwner(async (tx) => {
    // Wipe any prior subscription/token rows for our test users so re-runs work.
    await tx.delete(schema.mcpTokens).where(eq(schema.mcpTokens.userId, TEST_USERS.alice));
    await tx.delete(schema.mcpTokens).where(eq(schema.mcpTokens.userId, TEST_USERS.bob));
    await tx.delete(schema.subscriptions).where(eq(schema.subscriptions.userId, TEST_USERS.alice));
    await tx.delete(schema.subscriptions).where(eq(schema.subscriptions.userId, TEST_USERS.bob));

    await tx.insert(schema.mcpTokens).values([
      {
        userId: TEST_USERS.alice,
        name: 'alice-test',
        tokenHash: hashToken(aliceToken, appSecret),
      },
      {
        userId: TEST_USERS.bob,
        name: 'bob-test',
        tokenHash: hashToken(bobToken, appSecret),
      },
      {
        userId: TEST_USERS.alice,
        name: 'alice-revoked',
        tokenHash: hashToken(revokedToken, appSecret),
        revokedAt: rawSql`now()`,
      },
    ]);

    await tx.insert(schema.subscriptions).values({
      userId: TEST_USERS.alice,
      razorpaySubscriptionId: 'sub_test_alice_active',
      status: 'active',
    });
  });

  return { aliceToken, bobToken, revokedToken };
}

function randomBase64(len: number): string {
  // Sufficient for tests; production tokens come from generateToken().
  const buf = new Uint8Array(Math.ceil((len * 3) / 4));
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString('base64url').slice(0, len);
}
