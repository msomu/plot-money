// Hono context shape — both the Workers Bindings and per-request Variables
// added by middleware.

import type { AppDB } from '@plot-money/shared';

export type AuthMethod = 'session' | 'bearer';

export interface Bindings {
  /** D1 binding from wrangler.toml. Tenant + auth tables. */
  DB: D1Database;
  /** R2 bucket for v0.2 file uploads. Bound but unused in v0.1. */
  FILES: R2Bucket;

  // Public env (wrangler.toml [vars] / [env.production.vars]).
  NODE_ENV: string;
  APP_URL: string;
  WEB_URL: string;
  ALLOWED_ORIGINS: string;

  // Secrets (wrangler secret put).
  APP_SECRET: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
}

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    /** Resolved user id from session or bearer token. */
    userId?: string;
    /** Which auth path matched. */
    authMethod?: AuthMethod;
    /** Token id from mcp_tokens row, when authMethod === 'bearer'. */
    tokenId?: string;
    /** Drizzle handle bound to this request's D1. */
    db: AppDB;
  };
};
