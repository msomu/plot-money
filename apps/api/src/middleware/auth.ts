// Resolves the calling user from one of:
//   1. A Better Auth session cookie.
//   2. An Authorization: Bearer <token> header — checks `mcp_tokens`.
//
// On success, sets `userId`, `authMethod`, and `tokenId` (bearer only) on
// the Hono context. On failure, throws AppError(UNAUTHORIZED).
//
// Side effect: bearer tokens get their `last_used_at` bumped. The DB write
// is awaited via ExecutionContext.waitUntil-style fire-and-forget so it
// doesn't block the request.

import type { MiddlewareHandler } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { AppError, schema } from '@plot-money/shared';
import { hashToken, looksLikeToken } from '../lib/tokens.ts';
import { getAuth } from '../auth.ts';
import type { AppEnv } from '../types.ts';

export function requireAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // Path 1: Better Auth session cookie. Cheap when no cookie is sent —
    // getSession returns null without doing DB work.
    if (c.req.header('Cookie')) {
      const session = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers });
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

    const tokenHash = hashToken(raw, c.env.APP_SECRET);
    const db = c.var.db;

    const [matched] = await db
      .select({ id: schema.mcpTokens.id, userId: schema.mcpTokens.userId })
      .from(schema.mcpTokens)
      .where(and(eq(schema.mcpTokens.tokenHash, tokenHash), isNull(schema.mcpTokens.revokedAt)))
      .limit(1);

    if (!matched) {
      throw new AppError('UNAUTHORIZED', 'Invalid or revoked token');
    }

    c.set('userId', matched.userId);
    c.set('authMethod', 'bearer');
    c.set('tokenId', matched.id);

    // Bump last_used_at without blocking the request.
    void db
      .update(schema.mcpTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.mcpTokens.id, matched.id))
      .catch((err: unknown) => {
        console.error('[auth] failed to bump last_used_at', err);
      });

    await next();
  };
}
