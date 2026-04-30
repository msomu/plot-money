// Subscription gate. Used on /mcp routes — without an `active` subscription
// the user can sign in and look at the dashboard, but can't actually call
// MCP tools.
//
// Read happens under the user's RLS context, so we can't see other users'
// subs even by accident.

import type { MiddlewareHandler } from 'hono';
import { eq } from 'drizzle-orm';
import { AppError, schema, withRls } from '@plot-money/shared';
import type { AppEnv } from '../types.ts';

export function requireActiveSubscription(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userId = c.get('userId');
    if (!userId) {
      throw new AppError('UNAUTHORIZED', 'Auth required before subscription check');
    }

    const active = await withRls(userId, async (tx) => {
      const rows = await tx
        .select({ status: schema.subscriptions.status })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.status, 'active'))
        .limit(1);
      return rows.length > 0;
    });

    if (!active) {
      throw new AppError(
        'SUBSCRIPTION_INACTIVE',
        'No active subscription. Visit https://app.plot.money to subscribe.',
      );
    }

    await next();
  };
}
