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
import { getAuth } from '../auth.ts';
import type { AppEnv } from '../types.ts';

export function requireAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const env = loadEnv();

    // Path 1: Better Auth session cookie. Cheap if no cookie is present —
    // getSession returns null without a DB hit when there's nothing to look up.
    if (c.req.header('Cookie')) {
      const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
      if (session) {
        c.set('userId', session.user.id);
        c.set('authMethod', 'session');
        return next();
      }
    }

    // Path 2: Bearer token (the MCP path).
    const header = c.req.header('Authorization') ?? '';
    if (!header.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 'Missing session cookie or Authorization: Bearer <token>');
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
