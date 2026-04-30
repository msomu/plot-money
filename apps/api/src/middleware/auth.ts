// Resolves the calling user from one of:
//   1. A session cookie (Better Auth) — wired up in Phase 3, stubbed here.
//   2. An Authorization: Bearer <token> header — checks `mcp_tokens`.
//
// On success, sets `userId`, `authMethod`, and `tokenId` (bearer only) on
// the Hono context. On failure, throws AppError(UNAUTHORIZED).
//
// Side effect: bearer tokens get their `last_used_at` bumped. Done with
// withOwner (no RLS) because the hash lookup happens before we know the
// user, so there's no current_user_id to bind.

import type { MiddlewareHandler } from 'hono';
import { and, eq, isNull, sql as rawSql } from 'drizzle-orm';
import { AppError, schema, withOwner } from '@plot-money/shared';
import { hashToken, looksLikeToken } from '../lib/tokens.ts';
import { loadEnv } from '../env.ts';
import type { AppEnv } from '../types.ts';

export function requireAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const env = loadEnv();

    // Session path is stubbed for now — Better Auth lands in Phase 3.
    // When it does, look up the session cookie here and set userId/authMethod.

    const header = c.req.header('Authorization') ?? '';
    if (!header.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 'Missing Authorization: Bearer <token>');
    }

    const raw = header.slice('Bearer '.length).trim();
    if (!looksLikeToken(raw)) {
      throw new AppError('UNAUTHORIZED', 'Malformed token');
    }

    const tokenHash = hashToken(raw, env.APP_SECRET);

    const matched = await withOwner(async (tx) => {
      const rows = await tx
        .select({
          id: schema.mcpTokens.id,
          userId: schema.mcpTokens.userId,
        })
        .from(schema.mcpTokens)
        .where(and(eq(schema.mcpTokens.tokenHash, tokenHash), isNull(schema.mcpTokens.revokedAt)))
        .limit(1);
      return rows[0];
    });

    if (!matched) {
      throw new AppError('UNAUTHORIZED', 'Invalid or revoked token');
    }

    c.set('userId', matched.userId);
    c.set('authMethod', 'bearer');
    c.set('tokenId', matched.id);

    // Update last_used_at without blocking the request. Failure is logged.
    void withOwner(async (tx) => {
      await tx
        .update(schema.mcpTokens)
        .set({ lastUsedAt: rawSql`now()` })
        .where(eq(schema.mcpTokens.id, matched.id));
    }).catch((err) => {
      console.error('[auth] failed to bump last_used_at', err);
    });

    await next();
  };
}
