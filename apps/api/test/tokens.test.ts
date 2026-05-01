// Token CRUD + subscription status integration tests.
//
// Drives the API via app.fetch with the seeded alice/bob bearer tokens
// (the bearer auth path is sufficient for these endpoints — the session
// cookie path goes through the same `c.get('userId')` plumbing).

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { closeDb } from '@plot-money/shared';
import { _resetEnvForTests } from '../src/env.ts';
import { setupFixtures, type Fixtures } from './setup.ts';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is required');
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

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function listTokens(token: string) {
  const res = await app.request('/api/tokens', { headers: bearer(token) });
  expect(res.status).toBe(200);
  return ((await res.json()) as { tokens: Array<{ id: string; name: string }> }).tokens;
}

describe('token CRUD', () => {
  test('GET /api/tokens returns alice tokens (the seeded ones)', async () => {
    const tokens = await listTokens(fixtures.aliceToken);
    // The seed creates: alice-test (used for this request, not revoked) and
    // alice-revoked (revoked, must NOT appear in the list).
    expect(tokens.find((t) => t.name === 'alice-test')).toBeDefined();
    expect(tokens.find((t) => t.name === 'alice-revoked')).toBeUndefined();
  });

  test('POST /api/tokens creates a token and returns it once', async () => {
    const res = await app.request('/api/tokens', {
      method: 'POST',
      headers: { ...bearer(fixtures.aliceToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Claude' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string; token: string };
    expect(body.name).toBe('New Claude');
    expect(body.token).toMatch(/^plot_/);
    expect(body.token.length).toBeGreaterThan(40);

    // Subsequent list should include it (and never expose the raw token).
    const tokens = await listTokens(fixtures.aliceToken);
    const found = tokens.find((t) => t.id === body.id);
    expect(found).toBeDefined();
    expect((found as Record<string, unknown>)['token']).toBeUndefined();
  });

  test('POST /api/tokens rejects empty name', async () => {
    const res = await app.request('/api/tokens', {
      method: 'POST',
      headers: { ...bearer(fixtures.aliceToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('alice cannot see bob tokens (RLS)', async () => {
    const aliceTokens = await listTokens(fixtures.aliceToken);
    const bobTokens = await listTokens(fixtures.bobToken);
    expect(aliceTokens.find((t) => t.name === 'bob-test')).toBeUndefined();
    expect(bobTokens.find((t) => t.name === 'bob-test')).toBeDefined();
    expect(bobTokens.find((t) => t.name === 'alice-test')).toBeUndefined();
  });

  test('DELETE /api/tokens/:id soft-revokes and the token disappears from list', async () => {
    // Create a fresh one to revoke.
    const create = await app.request('/api/tokens', {
      method: 'POST',
      headers: { ...bearer(fixtures.aliceToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'To revoke' }),
    });
    const { id } = (await create.json()) as { id: string };

    const del = await app.request(`/api/tokens/${id}`, {
      method: 'DELETE',
      headers: bearer(fixtures.aliceToken),
    });
    expect(del.status).toBe(200);

    const tokens = await listTokens(fixtures.aliceToken);
    expect(tokens.find((t) => t.id === id)).toBeUndefined();
  });

  test('DELETE /api/tokens/:id of non-existent or already-revoked token returns 404', async () => {
    const res = await app.request('/api/tokens/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
      headers: bearer(fixtures.aliceToken),
    });
    expect(res.status).toBe(404);
  });

  test('alice cannot revoke bob tokens (RLS — appears as NOT_FOUND)', async () => {
    const bobTokens = await listTokens(fixtures.bobToken);
    const target = bobTokens[0]!;
    const res = await app.request(`/api/tokens/${target.id}`, {
      method: 'DELETE',
      headers: bearer(fixtures.aliceToken),
    });
    expect(res.status).toBe(404);

    // Confirm it's still alive on bob's side.
    const stillThere = await listTokens(fixtures.bobToken);
    expect(stillThere.find((t) => t.id === target.id)).toBeDefined();
  });

  test('token endpoints require auth', async () => {
    expect((await app.request('/api/tokens')).status).toBe(401);
    expect(
      (
        await app.request('/api/tokens', {
          method: 'POST',
          body: JSON.stringify({ name: 'x' }),
        })
      ).status,
    ).toBe(401);
  });
});

describe('subscription status', () => {
  test('alice sees active (seeded subscription)', async () => {
    const res = await app.request('/api/subscription/status', {
      headers: bearer(fixtures.aliceToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { active: boolean; status: string };
    expect(body.active).toBe(true);
    expect(body.status).toBe('active');
  });

  test('bob sees no subscription', async () => {
    const res = await app.request('/api/subscription/status', {
      headers: bearer(fixtures.bobToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { active: boolean; status: string | null };
    expect(body.active).toBe(false);
    expect(body.status).toBeNull();
  });
});
