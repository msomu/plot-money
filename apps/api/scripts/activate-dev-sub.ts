// Activate (or create) a dev subscription for a given user — useful for
// poking around the dashboard before the Razorpay flow exists.
//
// Usage:
//   bun apps/api/scripts/activate-dev-sub.ts msomasundaram93@gmail.com
//
// Idempotent: if the user already has a 'sub_dev_local' row, its status
// flips to 'active' and the period extends 30 days. Safe to re-run.
//
// NEVER use in production — bypasses Razorpay and writes a fake row.

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from '@plot-money/shared';

const email = process.argv[2];
if (!email) {
  console.error('Usage: bun apps/api/scripts/activate-dev-sub.ts <email>');
  process.exit(1);
}

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(url, { ssl: 'require', max: 1 });
const db = drizzle(sql, { schema });

try {
  const userRows = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  const user = userRows[0];
  if (!user) {
    console.error(`No user with email ${email}. Sign in via the web app first.`);
    process.exit(1);
  }

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fakeRazorpayId = `sub_dev_${user.id.slice(0, 8)}`;

  // Check for existing row first so we can update vs insert without
  // depending on a unique-constraint clash.
  const existing = await db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.razorpaySubscriptionId, fakeRazorpayId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.subscriptions)
      .set({
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        updatedAt: now,
      })
      .where(eq(schema.subscriptions.id, existing[0]!.id));
    console.log(
      `✓ Refreshed existing dev sub for ${email} (active until ${periodEnd.toISOString()})`,
    );
  } else {
    await db.insert(schema.subscriptions).values({
      userId: user.id,
      razorpaySubscriptionId: fakeRazorpayId,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    });
    console.log(`✓ Created dev sub for ${email} (active until ${periodEnd.toISOString()})`);
  }
} finally {
  await sql.end();
}
