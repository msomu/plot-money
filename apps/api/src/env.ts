// Typed env access. Bun reads .env / .env.local automatically — this module
// just validates and exposes typed accessors. Anything required for boot is
// asserted eagerly in `loadEnv()` so missing config crashes the process at
// startup rather than mid-request.

import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  WEB_URL: z.string().url().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Salt for HMAC-hashing MCP bearer tokens. Generate with `openssl rand -hex 32`.
  // Must be stable — rotating it invalidates all existing tokens.
  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 chars'),
});

export type Env = z.infer<typeof EnvSchema> & { ALLOWED_ORIGINS_LIST: string[] };

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = {
    ...parsed.data,
    ALLOWED_ORIGINS_LIST: parsed.data.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
  };
  return cached;
}

/** For tests: clear the cache so a fresh loadEnv() picks up new process.env. */
export function _resetEnvForTests(): void {
  cached = undefined;
}
