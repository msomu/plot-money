// Token CRUD + subscription status integration tests against D1.

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

async function listTokens(token: string) {
  const res = await app.request('/api/tokens', { headers: bearer(token) }, env.bindings);
  expect(res.status).toBe(200);
  return ((await res.json()) as { tokens: Array<{ id: string; name: string }> }).tokens;
}

describe('token CRUD', () => {
  test('GET /api/tokens returns alice tokens (excludes revoked)', async () => {
    const tokens = await listTokens(env.fixtures.aliceToken);
    expect(tokens.find((t) => t.name === 'alice-test')).toBeDefined();
    expect(tokens.find((t) => t.name === 'alice-revoked')).toBeUndefined();
  });

  test('POST /api/tokens creates a token and returns it once', async () => {
    const res = await app.request(
      '/api/tokens',
      {
        method: 'POST',
        headers: { ...bearer(env.fixtures.aliceToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Claude' }),
      },
      env.bindings,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string; token: string };
    expect(body.name).toBe('New Claude');
    expect(body.token).toMatch(/^plot_/);
    expect(body.token.length).toBeGreaterThan(40);

    const tokens = await listTokens(env.fixtures.aliceToken);
    const found = tokens.find((t) => t.id === body.id);
    expect(found).toBeDefined();
    expect((found as Record<string, unknown>)['token']).toBeUndefined();
  });

  test('POST /api/tokens rejects empty name', async () => {
    const res = await app.request(
      '/api/tokens',
      {
        method: 'POST',
        headers: { ...bearer(env.fixtures.aliceToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      },
      env.bindings,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('alice cannot see bob tokens (tenant isolation)', async () => {
    const aliceTokens = await listTokens(env.fixtures.aliceToken);
    const bobTokens = await listTokens(env.fixtures.bobToken);
    expect(aliceTokens.find((t) => t.name === 'bob-test')).toBeUndefined();
    expect(bobTokens.find((t) => t.name === 'bob-test')).toBeDefined();
    expect(bobTokens.find((t) => t.name === 'alice-test')).toBeUndefined();
  });

  test('DELETE /api/tokens/:id soft-revokes and the token disappears from list', async () => {
    const create = await app.request(
      '/api/tokens',
      {
        method: 'POST',
        headers: { ...bearer(env.fixtures.aliceToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'To revoke' }),
      },
      env.bindings,
    );
    const { id } = (await create.json()) as { id: string };

    const del = await app.request(
      `/api/tokens/${id}`,
      { method: 'DELETE', headers: bearer(env.fixtures.aliceToken) },
      env.bindings,
    );
    expect(del.status).toBe(200);

    const tokens = await listTokens(env.fixtures.aliceToken);
    expect(tokens.find((t) => t.id === id)).toBeUndefined();
  });

  test('DELETE /api/tokens/:id of non-existent or already-revoked token returns 404', async () => {
    const res = await app.request(
      '/api/tokens/00000000-0000-0000-0000-000000000000',
      { method: 'DELETE', headers: bearer(env.fixtures.aliceToken) },
      env.bindings,
    );
    expect(res.status).toBe(404);
  });

  test('alice cannot revoke bob tokens (tenant isolation — appears as NOT_FOUND)', async () => {
    const bobTokens = await listTokens(env.fixtures.bobToken);
    const target = bobTokens[0]!;
    const res = await app.request(
      `/api/tokens/${target.id}`,
      { method: 'DELETE', headers: bearer(env.fixtures.aliceToken) },
      env.bindings,
    );
    expect(res.status).toBe(404);

    // Confirm it's still alive on bob's side.
    const stillThere = await listTokens(env.fixtures.bobToken);
    expect(stillThere.find((t) => t.id === target.id)).toBeDefined();
  });

  test('token endpoints require auth', async () => {
    expect((await app.request('/api/tokens', {}, env.bindings)).status).toBe(401);
    expect(
      (
        await app.request(
          '/api/tokens',
          { method: 'POST', body: JSON.stringify({ name: 'x' }) },
          env.bindings,
        )
      ).status,
    ).toBe(401);
  });
});

describe('subscription status', () => {
  test('alice sees active (seeded subscription)', async () => {
    const res = await app.request(
      '/api/subscription/status',
      { headers: bearer(env.fixtures.aliceToken) },
      env.bindings,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { active: boolean; status: string };
    expect(body.active).toBe(true);
    expect(body.status).toBe('active');
  });

  test('bob sees no subscription', async () => {
    const res = await app.request(
      '/api/subscription/status',
      { headers: bearer(env.fixtures.bobToken) },
      env.bindings,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { active: boolean; status: string | null };
    expect(body.active).toBe(false);
    expect(body.status).toBeNull();
  });

  test('verified Razorpay payment activates bob', async () => {
    const orderId = 'order_test_bob';
    const paymentId = 'pay_test_bob';
    const signature = await hmacSha256Hex(
      `${orderId}|${paymentId}`,
      env.bindings.RAZORPAY_KEY_SECRET,
    );

    const res = await app.request(
      '/api/subscription/verify',
      {
        method: 'POST',
        headers: {
          ...bearer(env.fixtures.bobToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
        }),
      },
      env.bindings,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { active: boolean; status: string };
    expect(body.active).toBe(true);
    expect(body.status).toBe('active');
  });

  test('rejects invalid Razorpay signature', async () => {
    const res = await app.request(
      '/api/subscription/verify',
      {
        method: 'POST',
        headers: {
          ...bearer(env.fixtures.bobToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          razorpay_order_id: 'order_test_bad',
          razorpay_payment_id: 'pay_test_bad',
          razorpay_signature: 'bad',
        }),
      },
      env.bindings,
    );

    expect(res.status).toBe(400);
  });
});

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
