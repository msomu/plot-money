// Liveness + readiness in one tiny route.
//
// Returns 200 with build metadata if Postgres is reachable, 503 if not.
// Used by Railway / uptime monitors. No auth.

import { Hono } from 'hono';
import { sql as rawSql } from 'drizzle-orm';
import { withOwner } from '@plot-money/shared';
import type { AppEnv } from '../types.ts';

export const healthRoute = new Hono<AppEnv>();

healthRoute.get('/health', async (c) => {
  let dbOk = false;
  let dbError: string | undefined;
  try {
    await withOwner(async (tx) => {
      await tx.execute(rawSql`select 1`);
    });
    dbOk = true;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return c.json(
    {
      ok: dbOk,
      service: 'plot-money-api',
      version: '0.1.0',
      db: dbOk ? 'reachable' : 'unreachable',
      ...(dbError && { dbError }),
    },
    dbOk ? 200 : 503,
  );
});
