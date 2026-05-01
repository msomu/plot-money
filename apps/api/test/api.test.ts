// Integration tests for the Hono app.
//
// Drives `app.fetch` directly with synthetic Request objects — no port
// binding. Talks to the real Neon dev branch via DATABASE_URL.

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { closeDb } from '@plot-money/shared';
import { _resetEnvForTests } from '../src/env.ts';
import { setupFixtures, type Fixtures } from './setup.ts';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is required');

// Force a stable APP_SECRET for tests so token hashes are deterministic.
process.env['APP_SECRET'] = 'test_secret_'.padEnd(64, 'x');
_resetEnvForTests();

let fixtures: Fixtures;
let app: Awaited<ReturnType<typeof loadApp>>;

async function loadApp() {
  const { createApp } = await import('../src/app.ts');
  return createApp();
}

beforeAll(async () => {
  fixtures = await setupFixtures(databaseUrl!, process.env['APP_SECRET']!);
  app = await loadApp();
}, 60_000);

afterAll(async () => {
  await closeDb();
}, 30_000);

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('GET /health', () => {
  test('returns 200 with db reachable', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; db: string };
    expect(body.ok).toBe(true);
    expect(body.db).toBe('reachable');
  });
});

describe('auth on /api/me', () => {
  test('rejects request with no Authorization header', async () => {
    const res = await app.request('/api/me');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('rejects malformed token', async () => {
    const res = await app.request('/api/me', { headers: bearer('not-a-token') });
    expect(res.status).toBe(401);
  });

  test('rejects token that is not in the database', async () => {
    const res = await app.request('/api/me', {
      headers: bearer('plot_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('rejects revoked token', async () => {
    const res = await app.request('/api/me', { headers: bearer(fixtures.revokedToken) });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('accepts valid token and returns userId', async () => {
    const res = await app.request('/api/me', { headers: bearer(fixtures.aliceToken) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string; authMethod: string; tokenId: string };
    expect(body.authMethod).toBe('bearer');
    expect(body.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.tokenId).toBeDefined();
  });
});

describe('subscription gate on /mcp', () => {
  test('rejects unauthenticated request', async () => {
    const res = await app.request('/mcp', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  test('rejects authenticated user without active subscription', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: bearer(fixtures.bobToken),
    });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('SUBSCRIPTION_INACTIVE');
  });

  test('accepts authenticated user with active subscription (initialize handshake)', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        ...bearer(fixtures.aliceToken),
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { serverInfo: { name: string } } };
    expect(body.result.serverInfo.name).toBe('plot.money');
  });
});
