// API integration tests against a Miniflare-backed D1.
//
// Drives the Hono app via app.fetch with a synthetic Request. The third
// argument to app.request lets us pass per-request bindings (the D1 +
// secrets the middleware reads from c.env).

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { createApp } from '../src/app.ts';
import { setupTestEnv, type TestEnv } from './setup.ts';

let env: TestEnv;
const app = createApp();

beforeAll(async () => {
  env = await setupTestEnv();
}, 60_000);

afterAll(async () => {
  await env.dispose();
}, 30_000);

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('GET /health', () => {
  test('returns 200 with db reachable', async () => {
    const res = await app.request('/health', {}, env.bindings);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; db: string };
    expect(body.ok).toBe(true);
    expect(body.db).toBe('reachable');
  });
});

describe('Better Auth routes', () => {
  test('GET /api/auth/get-session returns null when no cookie is sent', async () => {
    const res = await app.request('/api/auth/get-session', {}, env.bindings);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe('null');
  });

  test('POST /api/auth/sign-in/social returns 404 when Google is not configured', async () => {
    const res = await app.request(
      '/api/auth/sign-in/social',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: 'http://localhost:5173/app' }),
      },
      env.bindings,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('PROVIDER_NOT_FOUND');
  });
});

describe('auth on /api/me', () => {
  test('rejects request with no Authorization header', async () => {
    const res = await app.request('/api/me', {}, env.bindings);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('rejects malformed token', async () => {
    const res = await app.request('/api/me', { headers: bearer('not-a-token') }, env.bindings);
    expect(res.status).toBe(401);
  });

  test('rejects token that is not in the database', async () => {
    const res = await app.request(
      '/api/me',
      { headers: bearer('plot_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') },
      env.bindings,
    );
    expect(res.status).toBe(401);
  });

  test('rejects revoked token', async () => {
    const res = await app.request(
      '/api/me',
      { headers: bearer(env.fixtures.revokedToken) },
      env.bindings,
    );
    expect(res.status).toBe(401);
  });

  test('accepts valid token and returns userId', async () => {
    const res = await app.request(
      '/api/me',
      { headers: bearer(env.fixtures.aliceToken) },
      env.bindings,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string; authMethod: string; tokenId: string };
    expect(body.authMethod).toBe('bearer');
    expect(body.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.tokenId).toBeDefined();
  });
});

describe('subscription gate on /mcp', () => {
  test('rejects unauthenticated request', async () => {
    const res = await app.request('/mcp', { method: 'POST' }, env.bindings);
    expect(res.status).toBe(401);
  });

  test('rejects authenticated user without active subscription', async () => {
    const res = await app.request(
      '/mcp',
      { method: 'POST', headers: bearer(env.fixtures.bobToken) },
      env.bindings,
    );
    expect(res.status).toBe(402);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('SUBSCRIPTION_INACTIVE');
  });
});
