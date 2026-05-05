import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { AppError, schema, tenant } from '@plot-money/shared';
import { fromPaise } from '../_money.ts';
import type { ToolDef } from '../_types.ts';

const inputSchema = {
  account_id: z.string().optional().describe('If omitted, returns all accounts plus a grand total'),
};

type Input = { account_id?: string };

type SingleOutput = {
  account_id: string;
  account_name: string;
  balance: number;
  currency: string;
};

type AllOutput = {
  accounts: Array<{ id: string; name: string; type: string; balance: number; currency: string }>;
  total_balance: number;
  currency: string;
};

const tool: ToolDef<Input, SingleOutput | AllOutput> = {
  name: 'get_balance',
  title: 'Get balance',
  description:
    'Get the balance of a single account, or all accounts (with grand total) if account_id is omitted.',
  inputSchema,
  async handler(input, ctx) {
    const t = tenant(ctx.userId);
    const db = ctx.db;

    if (input.account_id) {
      const [r] = await db
        .select({
          id: schema.accounts.id,
          name: schema.accounts.name,
          balancePaise: schema.accounts.balancePaise,
          currency: schema.accounts.currency,
        })
        .from(schema.accounts)
        .where(and(t.accounts, eq(schema.accounts.id, input.account_id)))
        .limit(1);
      if (!r) throw new AppError('NOT_FOUND', `Account not found: ${input.account_id}`);
      return {
        account_id: r.id,
        account_name: r.name,
        balance: fromPaise(r.balancePaise),
        currency: r.currency,
      };
    }

    const rows = await db
      .select({
        id: schema.accounts.id,
        name: schema.accounts.name,
        type: schema.accounts.type,
        balancePaise: schema.accounts.balancePaise,
        currency: schema.accounts.currency,
      })
      .from(schema.accounts)
      .where(t.accounts);
    const accounts = rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      balance: fromPaise(r.balancePaise),
      currency: r.currency,
    }));
    const total = accounts.reduce((acc, a) => acc + a.balance, 0);
    return { accounts, total_balance: total, currency: 'INR' };
  },
};

export default tool;
