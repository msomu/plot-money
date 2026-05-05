// MCP token CRUD.
//
// All three endpoints require auth (session cookie OR an existing bearer
// token) but NOT an active subscription — minting a token without a sub
// is fine, the token is just unusable on /mcp until the sub flips active.
//
// On generate we return the raw token exactly once; only the HMAC hash
// lands in the DB. Revoke is soft (sets revoked_at) so the audit trail
// survives — the token stops working immediately because the auth
// middleware filters on `revoked_at IS NULL`.

import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AppError, schema, tenant } from '@plot-money/shared';
import { generateToken, hashToken } from '../lib/tokens.ts';
import type { AppEnv } from '../types.ts';

export const tokensRoute = new Hono<AppEnv>();

const generateSchema = z.object({
  name: z.string().min(1).max(80).trim(),
});

tokensRoute.get('/api/tokens', async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new AppError('UNAUTHORIZED', 'Auth required');
  const t = tenant(userId);

  const rows = await c.var.db
    .select({
      id: schema.mcpTokens.id,
      name: schema.mcpTokens.name,
      lastUsedAt: schema.mcpTokens.lastUsedAt,
      createdAt: schema.mcpTokens.createdAt,
    })
    .from(schema.mcpTokens)
    .where(and(t.mcpTokens, isNull(schema.mcpTokens.revokedAt)))
    .orderBy(desc(schema.mcpTokens.createdAt));

  return c.json({
    tokens: rows.map((r) => ({
      id: r.id,
      name: r.name,
      last_used_at: r.lastUsedAt?.toISOString() ?? null,
      created_at: r.createdAt.toISOString(),
    })),
  });
});

tokensRoute.post('/api/tokens', async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new AppError('UNAUTHORIZED', 'Auth required');

  const body = await c.req.json().catch(() => ({}));
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body');
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken, c.env.APP_SECRET);

  const [created] = await c.var.db
    .insert(schema.mcpTokens)
    .values({ userId, name: parsed.data.name, tokenHash })
    .returning({
      id: schema.mcpTokens.id,
      name: schema.mcpTokens.name,
      createdAt: schema.mcpTokens.createdAt,
    });

  // The raw token is shown once and never persisted — anything saved to
  // logs / metrics here would defeat the entire hash-on-store design.
  return c.json({
    id: created!.id,
    name: created!.name,
    token: rawToken,
    created_at: created!.createdAt.toISOString(),
  });
});

tokensRoute.delete('/api/tokens/:id', async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new AppError('UNAUTHORIZED', 'Auth required');
  const t = tenant(userId);

  const id = c.req.param('id');
  const result = await c.var.db
    .update(schema.mcpTokens)
    .set({ revokedAt: new Date() })
    .where(and(t.mcpTokens, eq(schema.mcpTokens.id, id), isNull(schema.mcpTokens.revokedAt)))
    .returning({ id: schema.mcpTokens.id });

  if (result.length === 0) {
    throw new AppError('NOT_FOUND', `Token not found or already revoked: ${id}`);
  }
  return c.json({ revoked: true, id });
});
