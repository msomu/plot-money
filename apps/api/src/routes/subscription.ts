// Subscription endpoints.
//
// v0.1 ships with a *placeholder* activate flow — clicking Subscribe in the
// dashboard creates an active subscription row directly, no Razorpay. The
// schema is the same one the real Razorpay webhook will write to in a
// later release, so swapping in real billing is purely an internal change
// the user never sees.

import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { AppError, schema, withRls } from '@plot-money/shared';
import type { AppEnv } from '../types.ts';

export const subscriptionRoute = new Hono<AppEnv>();

const PLACEHOLDER_PROVIDER_ID = 'sub_local_placeholder';
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

subscriptionRoute.get('/api/subscription/status', async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new AppError('UNAUTHORIZED', 'Auth required');

  const rows = await withRls(userId, (tx) =>
    tx
      .select({
        status: schema.subscriptions.status,
        currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
      })
      .from(schema.subscriptions)
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1),
  );

  const sub = rows[0];
  return c.json({
    active: sub?.status === 'active',
    status: sub?.status ?? null,
    current_period_end: sub?.currentPeriodEnd?.toISOString() ?? null,
  });
});

subscriptionRoute.post('/api/subscription/activate', async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new AppError('UNAUTHORIZED', 'Auth required');

  const now = new Date();
  const periodEnd = new Date(now.getTime() + ONE_MONTH_MS);
  // Each user gets their own placeholder provider id so the unique index
  // on razorpay_subscription_id never clashes across users.
  const providerId = `${PLACEHOLDER_PROVIDER_ID}_${userId.slice(0, 8)}`;

  return await withRls(userId, async (tx) => {
    const existing = await tx
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.razorpaySubscriptionId, providerId))
      .limit(1);

    if (existing.length > 0) {
      const updated = await tx
        .update(schema.subscriptions)
        .set({
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          updatedAt: now,
        })
        .where(eq(schema.subscriptions.id, existing[0]!.id))
        .returning({
          status: schema.subscriptions.status,
          currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
        });
      return c.json({
        active: true,
        status: updated[0]!.status,
        current_period_end: updated[0]!.currentPeriodEnd?.toISOString() ?? null,
      });
    }

    const created = await tx
      .insert(schema.subscriptions)
      .values({
        userId,
        razorpaySubscriptionId: providerId,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .returning({
        status: schema.subscriptions.status,
        currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
      });

    return c.json({
      active: true,
      status: created[0]!.status,
      current_period_end: created[0]!.currentPeriodEnd?.toISOString() ?? null,
    });
  });
});
