// Per-request env validation for Workers.
//
// Unlike the Bun version (which read process.env once at boot), Workers
// receive bindings on `c.env` per request — secrets land there too via
// `wrangler secret put`. We validate on the first call per request and
// crash loud if anything required is missing.

import { z } from 'zod';
import type { Bindings } from './types.ts';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url().default('http://localhost:8787'),
  WEB_URL: z.url().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 chars'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 chars'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema> & { ALLOWED_ORIGINS_LIST: string[] };

export function loadEnv(bindings: Pick<Bindings, keyof z.infer<typeof EnvSchema>>): Env {
  const parsed = EnvSchema.safeParse(bindings);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return {
    ...parsed.data,
    ALLOWED_ORIGINS_LIST: parsed.data.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
  };
}
