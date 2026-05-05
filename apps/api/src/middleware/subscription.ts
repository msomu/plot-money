// Subscription gate. Used on /mcp routes — without an `active` subscription
// the user can sign in and look at the dashboard, but can't actually call
// MCP tools.
//
// Read happens scoped to the user (tenant() predicate) so we never see
// other users' subs even by accident.

import type { MiddlewareHandler } from 'hono';
import { and, eq } from 'drizzle-orm';
import { AppError, schema, tenant } from '@plot-money/shared';
import type { AppEnv } from '../types.ts';

export function requireActiveSubscription(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userId = c.get('userId');
    if (!userId) {
      throw new AppError('UNAUTHORIZED', 'Auth required before subscription check');
    }

    const t = tenant(userId);
    const [active] = await c.var.db
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(and(t.subscriptions, eq(schema.subscriptions.status, 'active')))
      .limit(1);

    if (!active) {
      throw new AppError(
        'SUBSCRIPTION_INACTIVE',
        'No active subscription. Visit https://app.plot.money to subscribe.',
      );
    }

    await next();
  };
}
