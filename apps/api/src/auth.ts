// Better Auth instance — self-hosted, Drizzle-backed, Postgres-stored.
//
// Mounted on Hono at /api/auth/*. The library handles every endpoint
// (sign-in, callbacks, session, sign-out) over the standard Web Request /
// Response interface, which Hono on Bun hands us via `c.req.raw`.
//
// Schema mapping notes:
//   - usePlural: our table names are plural (users, sessions, …)
//   - we map Better Auth's logical "accounts" table to our oauthAccounts
//     Drizzle export, since "accounts" in our schema means *financial*
//     accounts. The `oauth_accounts` Postgres table is what gets queried.

import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from '@plot-money/shared';
import { loadEnv } from './env.ts';

type AuthInstance = ReturnType<typeof betterAuth>;
let _auth: AuthInstance | undefined;

export function getAuth(): AuthInstance {
  if (_auth) return _auth;

  const env = loadEnv();

  // Better Auth needs its OWN Postgres handle — it talks directly to the
  // database without going through our withRls wrapper. The auth tables
  // have no RLS by design, so the owner connection is correct.
  const sql = postgres(env.DATABASE_URL, { ssl: 'require', max: 5 });
  const db = drizzle(sql);

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
      provider: 'pg',
      usePlural: true,
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        // Map Better Auth's "accounts" key to our oauth_accounts Drizzle table.
        accounts: schema.oauthAccounts,
        verifications: schema.verifications,
      },
    }),
    socialProviders,
    advanced: {
      // Cookies need to be cross-site so app.plot.money can talk to api.plot.money.
      // In dev (localhost), browsers treat localhost specially so this is fine.
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
      },
    },
  };

  _auth = betterAuth(options);
  return _auth;
}
