// Hono app factory. Kept separate from src/index.ts so tests can import
// the app without booting the listener.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { initDb } from '@plot-money/shared';
import { loadEnv } from './env.ts';
import { errorHandler } from './middleware/error.ts';
import { requireAuth } from './middleware/auth.ts';
import { requireActiveSubscription } from './middleware/subscription.ts';
import { healthRoute } from './routes/health.ts';
import type { AppEnv } from './types.ts';

export function createApp(): Hono<AppEnv> {
  const env = loadEnv();
  initDb(env.DATABASE_URL);

  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use('*', logger());
  app.use(
    '*',
    cors({
      origin: env.ALLOWED_ORIGINS_LIST,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  // Public routes.
  app.route('/', healthRoute);

  // Authenticated REST API. More routes added in later phases.
  app.use('/api/*', requireAuth());
  app.get('/api/me', (c) =>
    c.json({
      userId: c.get('userId'),
      authMethod: c.get('authMethod'),
      tokenId: c.get('tokenId') ?? null,
    }),
  );

  // MCP requires both auth AND an active subscription.
  app.use('/mcp/*', requireAuth(), requireActiveSubscription());
  app.post('/mcp', requireAuth(), requireActiveSubscription(), (c) => {
    // Real MCP handler lands in Phase 4.
    return c.json({ ok: true, note: 'MCP transport not wired yet (Phase 4)' });
  });

  return app;
}
