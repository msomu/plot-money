// Hono app factory. Kept separate from src/index.ts so tests / miniflare
// can compose it without booting a Workers runtime.
//
// Order of middleware matters:
//   1. dbContext  — every request gets a Drizzle client bound to c.env.DB
//   2. logger     — must wrap user routes
//   3. cors       — origin allowlist read from env (per-request)
//   4. errorHandler is registered via app.onError, runs on throw
//
// Path-scoped middleware then layers auth + subscription gates on top.

import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { makeDb } from '@plot-money/shared';
import { loadEnv } from './env.ts';
import { errorHandler } from './middleware/error.ts';
import { requireAuth } from './middleware/auth.ts';
import { requireActiveSubscription } from './middleware/subscription.ts';
import { healthRoute } from './routes/health.ts';
import { tokensRoute } from './routes/tokens.ts';
import { subscriptionRoute } from './routes/subscription.ts';
import { handleMcpRequest } from './mcp/route.ts';
import { getAuth } from './auth.ts';
import type { AppEnv } from './types.ts';

/** Bind a per-request Drizzle client to c.var.db. */
function dbContext(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('db', makeDb(c.env.DB));
    await next();
  };
}

/** CORS that re-reads the allowlist from env on every request (no caching). */
function dynamicCors(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const env = loadEnv(c.env);
    return cors({
      origin: env.ALLOWED_ORIGINS_LIST,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })(c, next);
  };
}

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use('*', logger());
  app.use('*', dbContext());
  app.use('*', dynamicCors());

  // Public routes.
  app.route('/', healthRoute);

  // Better Auth — owns every /api/auth/* endpoint (sign-in, callbacks,
  // session, sign-out). Mounted before requireAuth so the public auth
  // endpoints stay reachable.
  app.on(['GET', 'POST'], '/api/auth/*', (c) => getAuth(c.env).handler(c.req.raw));

  // Authenticated REST API.
  app.use('/api/*', requireAuth());
  app.get('/api/me', (c) =>
    c.json({
      userId: c.get('userId'),
      authMethod: c.get('authMethod'),
      tokenId: c.get('tokenId') ?? null,
    }),
  );
  app.route('/', tokensRoute);
  app.route('/', subscriptionRoute);

  // MCP requires auth + active subscription. The transport speaks Web
  // Standard Request/Response so we hand c.req.raw straight to it.
  app.use('/mcp', requireAuth(), requireActiveSubscription());
  app.all('/mcp', handleMcpRequest);

  return app;
}
