// Drizzle Kit configuration.
//
// Two execution modes:
//   - Local migration generation: `drizzle-kit generate` doesn't need any
//     credentials; it diffs schema vs the migrations dir and emits SQL.
//   - Remote D1 push: `drizzle-kit push` needs the d1-http credentials
//     below. We typically run migrations via `wrangler d1 migrations apply`
//     instead, so the http driver section is optional.
//
// The generated SQL files are read by wrangler's migration runner — see
// apps/api/wrangler.toml for the migrations_dir binding.

import { defineConfig } from 'drizzle-kit';

const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
const databaseId = process.env['CLOUDFLARE_DATABASE_ID'];
const apiToken = process.env['CLOUDFLARE_D1_TOKEN'];

const remoteAvailable = Boolean(accountId && databaseId && apiToken);

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'sqlite',
  ...(remoteAvailable
    ? {
        driver: 'd1-http' as const,
        dbCredentials: {
          accountId: accountId!,
          databaseId: databaseId!,
          token: apiToken!,
        },
      }
    : {}),
  strict: true,
  verbose: true,
});
