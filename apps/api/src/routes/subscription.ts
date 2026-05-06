import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { AppError, schema, tenant } from '@plot-money/shared';
import { loadEnv } from '../env.ts';
import type { AppEnv } from '../types.ts';

export const subscriptionRoute = new Hono<AppEnv>();

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const MONTHLY_AMOUNT_PAISE = 29900;
const RAZORPAY_ORDER_URL = 'https://api.razorpay.com/v1/orders';

type RazorpayOrderResponse = {
  id: string;
  amount: number;
  currency: string;
};

function requireRazorpay(c: Context<AppEnv>) {
  const env = loadEnv(c.env);
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new AppError('INTERNAL', 'Razorpay is not configured');
  }
  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

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

subscriptionRoute.get('/api/subscription/status', async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new AppError('UNAUTHORIZED', 'Auth required');
  const t = tenant(userId);

  const [sub] = await c.var.db
    .select({
      status: schema.subscriptions.status,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
    })
    .from(schema.subscriptions)
    .where(t.subscriptions)
    .orderBy(desc(schema.subscriptions.createdAt))
    .limit(1);

  return c.json({
    active: sub?.status === 'active',
    status: sub?.status ?? null,
    current_period_end: sub?.currentPeriodEnd?.toISOString() ?? null,
  });
});

subscriptionRoute.post('/api/subscription/create-order', async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new AppError('UNAUTHORIZED', 'Auth required');
  const { keyId, keySecret } = requireRazorpay(c);

  const res = await fetch(RAZORPAY_ORDER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: MONTHLY_AMOUNT_PAISE,
      currency: 'INR',
      receipt: `plot_money_${userId.slice(0, 24)}_${Date.now()}`,
      notes: {
        user_id: userId,
        product: 'plot.money monthly',
      },
    }),
  });

  if (!res.ok) {
    console.error('[razorpay:create-order]', res.status, await res.text());
    throw new AppError('INTERNAL', 'Unable to start Razorpay checkout');
  }

  const order = (await res.json()) as RazorpayOrderResponse;
  return c.json({
    key_id: keyId,
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    name: 'plot.money',
    description: 'Monthly subscription',
  });
});

subscriptionRoute.post('/api/subscription/verify', async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new AppError('UNAUTHORIZED', 'Auth required');
  const { keySecret } = requireRazorpay(c);
  const t = tenant(userId);
  const body = (await c.req.json().catch(() => null)) as {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  } | null;

  if (!body?.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) {
    throw new AppError('VALIDATION_ERROR', 'Missing Razorpay payment fields');
  }

  const expected = await hmacSha256Hex(
    `${body.razorpay_order_id}|${body.razorpay_payment_id}`,
    keySecret,
  );
  if (!timingSafeEqual(expected, body.razorpay_signature)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid Razorpay payment signature');
  }

  const now = new Date();
  const periodEnd = new Date(now.getTime() + ONE_MONTH_MS);
  const providerId = body.razorpay_payment_id;
  const db = c.var.db;

  const [existing] = await db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(and(t.subscriptions, eq(schema.subscriptions.razorpaySubscriptionId, providerId)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(schema.subscriptions)
      .set({
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        updatedAt: now,
      })
      .where(and(t.subscriptions, eq(schema.subscriptions.id, existing.id)))
      .returning({
        status: schema.subscriptions.status,
        currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
      });
    return c.json({
      active: true,
      status: updated!.status,
      current_period_end: updated!.currentPeriodEnd?.toISOString() ?? null,
    });
  }

  const [created] = await db
    .insert(schema.subscriptions)
    .values({
      userId,
      razorpaySubscriptionId: providerId,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    })
    .returning({
      status: schema.subscriptions.status,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
    });

  return c.json({
    active: true,
    status: created!.status,
    current_period_end: created!.currentPeriodEnd?.toISOString() ?? null,
  });
});
