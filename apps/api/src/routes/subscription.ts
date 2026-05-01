// Subscription read endpoints. Razorpay-side write flows (create / cancel
// / webhook handler) land in Phase 5. For Phase 6 we only need a read so
// the dashboard knows whether to enable the "Generate token" button.

import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { AppError, schema, withRls } from '@plot-money/shared';
import type { AppEnv } from '../types.ts';

export const subscriptionRoute = new Hono<AppEnv>();

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
