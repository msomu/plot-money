// Liveness + readiness in one tiny route. Returns 200 if D1 is reachable,
// 503 if not. No auth.

import { Hono } from 'hono';
import { sql as rawSql } from 'drizzle-orm';
import type { AppEnv } from '../types.ts';

export const healthRoute = new Hono<AppEnv>();

healthRoute.get('/health', async (c) => {
  let dbOk = false;
  let dbError: string | undefined;
  try {
    await c.var.db.run(rawSql`select 1`);
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
