// End-to-end MCP integration tests.
//
// Drives app.fetch with synthetic MCP JSON-RPC requests over /mcp,
// covering: tool discovery, get_help (no DB), full account + transaction
// lifecycle with balance recomputation, validation errors, tenant
// isolation through MCP, and the four computed tools.

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { createApp } from '../src/app.ts';
import { setupTestEnv, TEST_ACCOUNTS, type TestEnv } from './setup.ts';

let env: TestEnv;
const app = createApp();

beforeAll(async () => {
  env = await setupTestEnv();
}, 60_000);

afterAll(async () => {
  await env.dispose();
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
  const res = await app.request(
    '/mcp',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} }),
    },
    env.bindings,
  );
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
    const res = await mcp(env.fixtures.aliceToken, 'tools/list');
    const tools = (res.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.length).toBe(13);
  });

  test('get_help works without a DB read', async () => {
    const result = await call<{ version: string; supported_categories: string[] }>(
      env.fixtures.aliceToken,
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
      env.fixtures.aliceToken,
      'add_account',
      { name: 'Test Wallet', type: 'cash', starting_balance: 5000 },
    );
    expect(r.balance).toBe(5000);
    expect(r.type).toBe('cash');
    accountId = r.id;
  });

  test('list_accounts shows the new account', async () => {
    const r = await call<{ accounts: Array<{ id: string }> }>(
      env.fixtures.aliceToken,
      'list_accounts',
    );
    expect(r.accounts.find((a) => a.id === accountId)).toBeDefined();
  });

  test('add_transaction (debit) decreases the balance', async () => {
    const r = await call<{ transaction: { id: string }; account_balance_after: number }>(
      env.fixtures.aliceToken,
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
    expect(r.account_balance_after).toBe(3500);
    txnId = r.transaction.id;
  });

  test('add_transaction (credit) increases the balance', async () => {
    const r = await call<{ account_balance_after: number }>(
      env.fixtures.aliceToken,
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
    expect(r.account_balance_after).toBe(5500);
  });

  test('list_transactions filters by account + date range', async () => {
    const r = await call<{ transactions: Array<{ id: string }>; total_count: number }>(
      env.fixtures.aliceToken,
      'list_transactions',
      { account_id: accountId, from_date: '2026-04-01', to_date: '2026-04-30' },
    );
    expect(r.total_count).toBe(2);
    expect(r.transactions.length).toBe(2);
  });

  test('update_transaction (amount change) recomputes balance', async () => {
    const r = await call<{ account_balance_after: number }>(
      env.fixtures.aliceToken,
      'update_transaction',
      { transaction_id: txnId, amount: 2000 },
    );
    expect(r.account_balance_after).toBe(5000);
  });

  test('update_transaction (type flip debit->credit) recomputes balance', async () => {
    const r = await call<{ account_balance_after: number }>(
      env.fixtures.aliceToken,
      'update_transaction',
      { transaction_id: txnId, type: 'credit' },
    );
    expect(r.account_balance_after).toBe(9000);
  });

  test('delete_transaction reverses its effect on the balance', async () => {
    const r = await call<{ account_balance_after: number }>(
      env.fixtures.aliceToken,
      'delete_transaction',
      { transaction_id: txnId },
    );
    expect(r.account_balance_after).toBe(7000);
  });

  test('delete_account fails when transactions still reference it', async () => {
    let threw = false;
    try {
      await call(env.fixtures.aliceToken, 'delete_account', { account_id: accountId });
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
      await call(env.fixtures.aliceToken, 'add_transaction', {
        account_id: TEST_ACCOUNTS.alice,
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
      await call(env.fixtures.aliceToken, 'add_transaction', {
        account_id: TEST_ACCOUNTS.alice,
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
      await call(env.fixtures.aliceToken, 'add_transaction', {
        account_id: TEST_ACCOUNTS.alice,
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

describe('tenant isolation through MCP', () => {
  test('alice cannot read bob accounts even when knowing the ID', async () => {
    let threw = false;
    try {
      await call(env.fixtures.aliceToken, 'get_balance', { account_id: TEST_ACCOUNTS.bob });
    } catch (err) {
      threw = true;
      expect(String(err)).toMatch(/not[_ ]?found/i);
    }
    expect(threw).toBe(true);
  });

  test('alice cannot delete bob accounts', async () => {
    let threw = false;
    try {
      await call(env.fixtures.aliceToken, 'delete_account', { account_id: TEST_ACCOUNTS.bob });
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
      env.fixtures.aliceToken,
      'get_balance',
      { account_id: TEST_ACCOUNTS.alice },
    );
    expect(r.account_id).toBe(TEST_ACCOUNTS.alice);
    expect(typeof r.balance).toBe('number');
  });

  test('get_balance returns all accounts + grand total when account_id omitted', async () => {
    const r = await call<{ accounts: unknown[]; total_balance: number }>(
      env.fixtures.aliceToken,
      'get_balance',
      {},
    );
    expect(Array.isArray(r.accounts)).toBe(true);
    expect(typeof r.total_balance).toBe('number');
  });

  test('get_cash_flow returns income, expenses, net for a range', async () => {
    const r = await call<{ income: number; expenses: number; net: number }>(
      env.fixtures.aliceToken,
      'get_cash_flow',
      { from_date: '2026-04-01', to_date: '2026-04-30' },
    );
    expect(r.net).toBe(r.income - r.expenses);
  });

  test('get_spending_by_category returns breakdown with percent', async () => {
    const r = await call<{
      breakdown: Array<{ category: string; amount: number; percent: number }>;
      total: number;
    }>(env.fixtures.aliceToken, 'get_spending_by_category', {
      from_date: '2026-04-01',
      to_date: '2026-04-30',
    });
    if (r.breakdown.length > 0) {
      const sumPercent = r.breakdown.reduce((s, b) => s + b.percent, 0);
      expect(sumPercent).toBeGreaterThanOrEqual(99);
      expect(sumPercent).toBeLessThanOrEqual(101);
    }
  });

  test('get_networth subtracts credit_card balances as liabilities', async () => {
    await call(env.fixtures.aliceToken, 'add_account', {
      name: 'Test Credit Card',
      type: 'credit_card',
      starting_balance: 25000,
    });
    const r = await call<{
      total_assets: number;
      total_liabilities: number;
      net_worth: number;
      by_type: Array<{ type: string; value: number }>;
    }>(env.fixtures.aliceToken, 'get_networth', {});
    expect(r.total_liabilities).toBeGreaterThanOrEqual(25000);
    expect(r.net_worth).toBe(r.total_assets - r.total_liabilities);
    const ccEntry = r.by_type.find((b) => b.type === 'credit_card');
    expect(ccEntry).toBeDefined();
    expect(ccEntry!.value).toBeLessThan(0);
  });
});
