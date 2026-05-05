// Better Auth instance — self-hosted, Drizzle-on-D1 backed.
//
// Mounted on Hono at /api/auth/*. The library handles every endpoint
// (sign-in, callbacks, session, sign-out) over the standard Web Request /
// Response interface.
//
// Workers don't have a "boot time" — every request is a fresh isolate
// (potentially), so we build the auth instance lazily per request. The
// underlying Drizzle DB binds to the D1 instance from this request's env.
// In practice the same isolate handles many requests so this is effectively
// a per-isolate cache.

import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { schema, makeDb } from '@plot-money/shared';
import { loadEnv } from './env.ts';
import type { Bindings } from './types.ts';

type AuthInstance = ReturnType<typeof betterAuth>;

const cache = new WeakMap<D1Database, AuthInstance>();

export function getAuth(bindings: Bindings): AuthInstance {
  const cached = cache.get(bindings.DB);
  if (cached) return cached;

  const env = loadEnv(bindings);
  const db = makeDb(bindings.DB);

  const socialProviders: BetterAuthOptions['socialProviders'] = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }

  const options: BetterAuthOptions = {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL,
    trustedOrigins: env.ALLOWED_ORIGINS_LIST,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      usePlural: true,
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        // Map Better Auth's logical "accounts" to our oauth_accounts
        // Drizzle table — "accounts" in our schema means *financial* accounts.
        accounts: schema.oauthAccounts,
        verifications: schema.verifications,
      },
    }),
    socialProviders,
    advanced: {
      // Single-origin deployment: api + web both live under plot.money via
      // path-based Workers Routes, so the cookie's default scope (the
      // request host) is exactly what we want — no domain override needed.
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
      },
    },
  };

  const instance = betterAuth(options);
  cache.set(bindings.DB, instance);
  return instance;
}
