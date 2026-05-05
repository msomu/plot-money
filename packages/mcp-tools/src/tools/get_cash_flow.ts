import { z } from 'zod';
import { and, eq, gte, lte, sql as rawSql, type SQL } from 'drizzle-orm';
import { schema, tenant } from '@plot-money/shared';
import { parseRangeDate } from '../_helpers.ts';
import { fromPaise } from '../_money.ts';
import type { ToolDef } from '../_types.ts';

const inputSchema = {
  from_date: z.string(),
  to_date: z.string(),
  account_id: z
    .string()
    .optional()
    .describe('Optional — restrict to one account; otherwise across all'),
};

type Input = { from_date: string; to_date: string; account_id?: string };

type Output = {
  from_date: string;
  to_date: string;
  income: number;
  expenses: number;
  net: number;
  transaction_count: number;
  currency: string;
};

const tool: ToolDef<Input, Output> = {
  name: 'get_cash_flow',
  title: 'Get cash flow',
  description:
    'Returns total income, total expenses, and net cash flow for a date range. Optionally scoped to one account.',
  inputSchema,
  async handler(input, ctx) {
    const t = tenant(ctx.userId);
    const from = parseRangeDate(input.from_date, 'from_date');
    const to = parseRangeDate(input.to_date, 'to_date');

    const conditions: SQL[] = [
      t.transactions,
      gte(schema.transactions.transactionDate, from),
      lte(schema.transactions.transactionDate, to),
    ];
    if (input.account_id) conditions.push(eq(schema.transactions.accountId, input.account_id));

    const rows = await ctx.db
      .select({
        type: schema.transactions.type,
        totalPaise: rawSql<number>`coalesce(sum(${schema.transactions.amountPaise}), 0)`,
        count: rawSql<number>`count(*)`,
      })
      .from(schema.transactions)
      .where(and(...conditions))
      .groupBy(schema.transactions.type);

    let income = 0;
    let expenses = 0;
    let count = 0;
    for (const r of rows) {
      const total = fromPaise(Number(r.totalPaise));
      const c = Number(r.count);
      if (r.type === 'credit') income += total;
      else expenses += total;
      count += c;
    }
    return {
      from_date: input.from_date,
      to_date: input.to_date,
      income,
      expenses,
      net: income - expenses,
      transaction_count: count,
      currency: 'INR',
    };
  },
};

export default tool;
