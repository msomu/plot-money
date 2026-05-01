// End-to-end MCP integration tests.
//
// Drives app.fetch with synthetic MCP JSON-RPC requests over /mcp,
// covering: tool discovery, get_help (no DB), full account + transaction
// lifecycle with balance recomputation, validation errors, RLS isolation,
// and the four computed tools.

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

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: number;
  result?: { content?: unknown[]; structuredContent?: Record<string, unknown>; isError?: boolean };
  error?: { code: number; message: string };
};

let nextId = 1;
async function mcp(token: string, method: string, params?: unknown): Promise<JsonRpcResponse> {
  const id = nextId++;
  const res = await app.request('/mcp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as JsonRpcResponse;
}

async function call<T = Record<string, unknown>>(
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const res = await mcp(token, 'tools/call', { name, arguments: args });
  if (res.result?.isError) {
    const block = (res.result.content as Array<{ text: string }> | undefined)?.[0];
    throw new Error(`Tool error: ${block?.text ?? 'unknown'}`);
  }
  return res.result?.structuredContent as T;
}

describe('MCP transport', () => {
  test('tools/list returns all 13 tools', async () => {
    const res = await mcp(fixtures.aliceToken, 'tools/list');
    const tools = (res.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.length).toBe(13);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'add_account',
        'add_transaction',
        'delete_account',
        'delete_transaction',
        'get_balance',
        'get_cash_flow',
        'get_help',
        'get_networth',
        'list_accounts',
        'list_transactions',
        'update_account',
        'update_transaction',
        'get_spending_by_category',
      ].sort(),
    );
  });

  test('get_help works without a DB read', async () => {
    const result = await call<{ version: string; supported_categories: string[] }>(
      fixtures.aliceToken,
      'get_help',
    );
    expect(result.version).toBe('0.1.0');
    expect(result.supported_categories.length).toBeGreaterThan(20);
  });
});

describe('account + transaction lifecycle', () => {
  let accountId: string;
  let txnId: string;

  test('add_account creates an account', async () => {
    const r = await call<{ id: string; balance: number; type: string }>(
      fixtures.aliceToken,
      'add_account',
      { name: 'Test Wallet', type: 'cash', starting_balance: 5000 },
    );
    expect(r.balance).toBe(5000);
    expect(r.type).toBe('cash');
    accountId = r.id;
  });

  test('list_accounts shows the new account', async () => {
    const r = await call<{ accounts: Array<{ id: string }> }>(fixtures.aliceToken, 'list_accounts');
    expect(r.accounts.find((a) => a.id === accountId)).toBeDefined();
  });

  test('add_transaction (debit) decreases the balance', async () => {
    const r = await call<{ transaction: { id: string }; account_balance_after: number }>(
      fixtures.aliceToken,
      'add_transaction',
      {
        account_id: accountId,
        amount: 1500,
        type: 'debit',
        category: 'groceries',
        description: 'Test groceries',
        transaction_date: '2026-04-15',
      },
    );
    expect(r.account_balance_after).toBe(3500); // 5000 - 1500
    txnId = r.transaction.id;
  });

  test('add_transaction (credit) increases the balance', async () => {
    const r = await call<{ account_balance_after: number }>(
      fixtures.aliceToken,
      'add_transaction',
      {
        account_id: accountId,
        amount: 2000,
        type: 'credit',
        category: 'salary',
        description: 'Test salary',
        transaction_date: '2026-04-20',
      },
    );
    expect(r.account_balance_after).toBe(5500); // 3500 + 2000
  });

  test('list_transactions filters by account + date range', async () => {
    const r = await call<{ transactions: Array<{ id: string }>; total_count: number }>(
      fixtures.aliceToken,
      'list_transactions',
      {
        account_id: accountId,
        from_date: '2026-04-01',
        to_date: '2026-04-30',
      },
    );
    expect(r.total_count).toBe(2);
    expect(r.transactions.length).toBe(2);
  });

  test('update_transaction (amount change) recomputes balance', async () => {
    // Original txn: -1500. New txn: -2000. Balance should drop by 500 -> 5000.
    const r = await call<{ account_balance_after: number }>(
      fixtures.aliceToken,
      'update_transaction',
      {
        transaction_id: txnId,
        amount: 2000,
      },
    );
    expect(r.account_balance_after).toBe(5000);
  });

  test('update_transaction (type flip debit->credit) recomputes balance', async () => {
    // From -2000 to +2000 on the same txn: balance goes from 5000 to 5000 + 4000 = 9000.
    const r = await call<{ account_balance_after: number }>(
      fixtures.aliceToken,
      'update_transaction',
      {
        transaction_id: txnId,
        type: 'credit',
      },
    );
    expect(r.account_balance_after).toBe(9000);
  });

  test('delete_transaction reverses its effect on the balance', async () => {
    // Reverting +2000 credit -> balance drops by 2000 to 7000.
    const r = await call<{ account_balance_after: number }>(
      fixtures.aliceToken,
      'delete_transaction',
      {
        transaction_id: txnId,
      },
    );
    expect(r.account_balance_after).toBe(7000);
  });

  test('delete_account fails when transactions still reference it', async () => {
    let threw = false;
    try {
      await call(fixtures.aliceToken, 'delete_account', { account_id: accountId });
    } catch (err) {
      threw = true;
      expect(String(err)).toMatch(/transaction/);
    }
    expect(threw).toBe(true);
  });
});

describe('validation errors', () => {
  test('add_transaction rejects negative amount', async () => {
    let threw = false;
    try {
      await call(fixtures.aliceToken, 'add_transaction', {
        account_id: '00000000-0000-4000-8000-00000000a001',
        amount: -10,
        type: 'debit',
        category: 'groceries',
        description: 'bad',
        transaction_date: '2026-04-01',
      });
    } catch (err) {
      threw = true;
      expect(String(err)).toMatch(/positive|greater|>0|too[_ ]small/i);
    }
    expect(threw).toBe(true);
  });

  test('add_transaction rejects future transaction_date', async () => {
    let threw = false;
    try {
      await call(fixtures.aliceToken, 'add_transaction', {
        account_id: '00000000-0000-4000-8000-00000000a001',
        amount: 100,
        type: 'debit',
        category: 'groceries',
        description: 'future',
        transaction_date: '2099-01-01',
      });
    } catch (err) {
      threw = true;
      expect(String(err)).toMatch(/future/i);
    }
    expect(threw).toBe(true);
  });

  test('add_transaction rejects bad category', async () => {
    let threw = false;
    try {
      await call(fixtures.aliceToken, 'add_transaction', {
        account_id: '00000000-0000-4000-8000-00000000a001',
        amount: 100,
        type: 'debit',
        category: 'not_a_real_category',
        description: 'x',
        transaction_date: '2026-04-01',
      });
    } catch (err) {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe('RLS isolation through MCP', () => {
  test('alice cannot read bob accounts even when knowing the ID', async () => {
    let threw = false;
    try {
      await call(fixtures.aliceToken, 'get_balance', {
        account_id: '00000000-0000-4000-8000-00000000b001',
      });
    } catch (err) {
      threw = true;
      expect(String(err)).toMatch(/not[_ ]?found/i);
    }
    expect(threw).toBe(true);
  });

  test('alice cannot delete bob accounts', async () => {
    let threw = false;
    try {
      await call(fixtures.aliceToken, 'delete_account', {
        account_id: '00000000-0000-4000-8000-00000000b001',
      });
    } catch (err) {
      threw = true;
      expect(String(err)).toMatch(/not[_ ]?found/i);
    }
    expect(threw).toBe(true);
  });
});

describe('computed tools', () => {
  test('get_balance returns single account', async () => {
    const r = await call<{ account_id: string; balance: number; account_name: string }>(
      fixtures.aliceToken,
      'get_balance',
      { account_id: '00000000-0000-4000-8000-00000000a001' },
    );
    expect(r.account_id).toBe('00000000-0000-4000-8000-00000000a001');
    expect(typeof r.balance).toBe('number');
  });

  test('get_balance returns all accounts + grand total when account_id omitted', async () => {
    const r = await call<{ accounts: unknown[]; total_balance: number }>(
      fixtures.aliceToken,
      'get_balance',
      {},
    );
    expect(Array.isArray(r.accounts)).toBe(true);
    expect(typeof r.total_balance).toBe('number');
  });

  test('get_cash_flow returns income, expenses, net for a range', async () => {
    const r = await call<{ income: number; expenses: number; net: number }>(
      fixtures.aliceToken,
      'get_cash_flow',
      { from_date: '2026-04-01', to_date: '2026-04-30' },
    );
    expect(r.net).toBe(r.income - r.expenses);
  });

  test('get_spending_by_category returns breakdown with percent', async () => {
    const r = await call<{
      breakdown: Array<{ category: string; amount: number; percent: number }>;
      total: number;
    }>(fixtures.aliceToken, 'get_spending_by_category', {
      from_date: '2026-04-01',
      to_date: '2026-04-30',
    });
    if (r.breakdown.length > 0) {
      const sumPercent = r.breakdown.reduce((s, b) => s + b.percent, 0);
      // Round-trip through tenths can lose 0.1 here and there.
      expect(sumPercent).toBeGreaterThanOrEqual(99);
      expect(sumPercent).toBeLessThanOrEqual(101);
    }
  });

  test('get_networth subtracts credit_card balances as liabilities', async () => {
    // Add a credit card with 25000 owed.
    await call(fixtures.aliceToken, 'add_account', {
      name: 'Test Credit Card',
      type: 'credit_card',
      starting_balance: 25000,
    });
    const r = await call<{
      total_assets: number;
      total_liabilities: number;
      net_worth: number;
      by_type: Array<{ type: string; value: number }>;
    }>(fixtures.aliceToken, 'get_networth', {});
    expect(r.total_liabilities).toBeGreaterThanOrEqual(25000);
    expect(r.net_worth).toBe(r.total_assets - r.total_liabilities);
    const ccEntry = r.by_type.find((b) => b.type === 'credit_card');
    expect(ccEntry).toBeDefined();
    expect(ccEntry!.value).toBeLessThan(0); // liabilities show as negative
  });
});
