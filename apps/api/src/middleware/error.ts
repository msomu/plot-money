// Maps thrown errors to JSON envelopes that follow the contract in
// docs/MCP-TOOLS.md §6: `{ error, code }` with the right HTTP status.
//
// Anything that isn't an AppError gets bucketed as INTERNAL and the original
// message is logged but never leaked to the client.

import type { Context } from 'hono';
import { AppError } from '@plot-money/shared';
import type { AppEnv } from '../types.ts';

export function errorHandler(err: Error, c: Context<AppEnv>): Response {
  if (err instanceof AppError) {
    return c.json(err.toJSON(), err.status as 400 | 401 | 402 | 404 | 500);
  }
  console.error('[unhandled]', err);
  return c.json({ error: 'Internal error', code: 'INTERNAL' as const }, 500);
}
