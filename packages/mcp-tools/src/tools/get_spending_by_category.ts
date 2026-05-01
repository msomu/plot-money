import { z } from 'zod';
import { and, eq, gte, lte, sql as rawSql } from 'drizzle-orm';
import { TRANSACTION_TYPES, schema, withRls } from '@plot-money/shared';
import { parseAmount, parseRangeDate } from '../_helpers.ts';
import type { ToolDef } from '../_types.ts';

const inputSchema = {
  from_date: z.string(),
  to_date: z.string(),
  type: z.enum(TRANSACTION_TYPES).default('debit'),
};

type Input = { from_date: string; to_date: string; type: (typeof TRANSACTION_TYPES)[number] };

type Output = {
  from_date: string;
  to_date: string;
  type: string;
  breakdown: Array<{ category: string; amount: number; percent: number }>;
  total: number;
  currency: string;
};

const tool: ToolDef<Input, Output> = {
  name: 'get_spending_by_category',
  title: 'Get spending by category',
  description:
    'Group transactions by category for a date range, returning amount + percent of total. Defaults to type=debit (spending).',
  inputSchema,
  async handler(input, ctx) {
    const from = parseRangeDate(input.from_date, 'from_date');
    const to = parseRangeDate(input.to_date, 'to_date');

    return await withRls(ctx.userId, async (tx) => {
      const rows = await tx
        .select({
          category: schema.transactions.category,
          total: rawSql<string>`coalesce(sum(${schema.transactions.amount}), 0)`,
        })
        .from(schema.transactions)
        .where(
          and(
            gte(schema.transactions.transactionDate, from),
            lte(schema.transactions.transactionDate, to),
            eq(schema.transactions.type, input.type),
          ),
        )
        .groupBy(schema.transactions.category);

      const items = rows.map((r) => ({ category: r.category, amount: parseAmount(r.total) }));
      const total = items.reduce((acc, i) => acc + i.amount, 0);
      const breakdown = items
        .map((i) => ({
          category: i.category,
          amount: i.amount,
          percent: total === 0 ? 0 : Math.round((i.amount / total) * 1000) / 10,
        }))
        .sort((a, b) => b.amount - a.amount);

      return {
        from_date: input.from_date,
        to_date: input.to_date,
        type: input.type,
        breakdown,
        total,
        currency: 'INR',
      };
    });
  },
};

export default tool;
