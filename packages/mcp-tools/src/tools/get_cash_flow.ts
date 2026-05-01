import { z } from 'zod';
import { and, eq, gte, lte, sql as rawSql, type SQL } from 'drizzle-orm';
import { schema, withRls } from '@plot-money/shared';
import { parseAmount, parseRangeDate } from '../_helpers.ts';
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
    const from = parseRangeDate(input.from_date, 'from_date');
    const to = parseRangeDate(input.to_date, 'to_date');

    const conditions: SQL[] = [
      gte(schema.transactions.transactionDate, from),
      lte(schema.transactions.transactionDate, to),
    ];
    if (input.account_id) conditions.push(eq(schema.transactions.accountId, input.account_id));

    return await withRls(ctx.userId, async (tx) => {
      const rows = await tx
        .select({
          type: schema.transactions.type,
          total: rawSql<string>`coalesce(sum(${schema.transactions.amount}), 0)`,
          count: rawSql<string>`count(*)`,
        })
        .from(schema.transactions)
        .where(and(...conditions))
        .groupBy(schema.transactions.type);

      let income = 0;
      let expenses = 0;
      let count = 0;
      for (const r of rows) {
        const total = parseAmount(r.total);
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
    });
  },
};

export default tool;
