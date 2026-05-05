import { z } from 'zod';
import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { CATEGORIES, TRANSACTION_TYPES, schema, tenant } from '@plot-money/shared';
import { parseRangeDate } from '../_helpers.ts';
import { fromPaise, toPaise } from '../_money.ts';
import type { ToolDef } from '../_types.ts';

const inputSchema = {
  from_date: z.string().optional().describe('Inclusive lower bound, YYYY-MM-DD'),
  to_date: z.string().optional().describe('Inclusive upper bound, YYYY-MM-DD'),
  category: z.enum(CATEGORIES).optional(),
  account_id: z.string().optional(),
  min_amount: z.number().nonnegative().optional(),
  max_amount: z.number().nonnegative().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
};

type Input = {
  from_date?: string;
  to_date?: string;
  category?: (typeof CATEGORIES)[number];
  account_id?: string;
  min_amount?: number;
  max_amount?: number;
  type?: (typeof TRANSACTION_TYPES)[number];
  limit: number;
  offset: number;
};

type Output = {
  transactions: Array<{
    id: string;
    account_id: string;
    account_name: string;
    amount: number;
    type: string;
    category: string;
    description: string;
    transaction_date: string;
    created_at: string;
  }>;
  total_count: number;
  returned_count: number;
};

const tool: ToolDef<Input, Output> = {
  name: 'list_transactions',
  title: 'List transactions',
  description:
    'Returns transactions for the user with optional filters: date range, category, account, amount range (rupees), type. Default limit 100, max 500.',
  inputSchema,
  async handler(input, ctx) {
    const t = tenant(ctx.userId);
    const conditions: SQL[] = [t.transactions];
    if (input.from_date) {
      conditions.push(
        gte(schema.transactions.transactionDate, parseRangeDate(input.from_date, 'from_date')),
      );
    }
    if (input.to_date) {
      conditions.push(
        lte(schema.transactions.transactionDate, parseRangeDate(input.to_date, 'to_date')),
      );
    }
    if (input.category) conditions.push(eq(schema.transactions.category, input.category));
    if (input.account_id) conditions.push(eq(schema.transactions.accountId, input.account_id));
    if (input.type) conditions.push(eq(schema.transactions.type, input.type));
    if (input.min_amount !== undefined) {
      conditions.push(gte(schema.transactions.amountPaise, toPaise(input.min_amount)));
    }
    if (input.max_amount !== undefined) {
      conditions.push(lte(schema.transactions.amountPaise, toPaise(input.max_amount)));
    }

    const whereClause = and(...conditions);
    const db = ctx.db;

    const rows = await db
      .select({
        id: schema.transactions.id,
        accountId: schema.transactions.accountId,
        accountName: schema.accounts.name,
        amountPaise: schema.transactions.amountPaise,
        type: schema.transactions.type,
        category: schema.transactions.category,
        description: schema.transactions.description,
        transactionDate: schema.transactions.transactionDate,
        createdAt: schema.transactions.createdAt,
      })
      .from(schema.transactions)
      .innerJoin(schema.accounts, eq(schema.accounts.id, schema.transactions.accountId))
      .where(whereClause)
      .orderBy(desc(schema.transactions.transactionDate), desc(schema.transactions.createdAt))
      .limit(input.limit)
      .offset(input.offset);

    const [{ value: total } = { value: 0 }] = await db
      .select({ value: count() })
      .from(schema.transactions)
      .where(whereClause);

    return {
      transactions: rows.map((r) => ({
        id: r.id,
        account_id: r.accountId,
        account_name: r.accountName,
        amount: fromPaise(r.amountPaise),
        type: r.type,
        category: r.category,
        description: r.description,
        transaction_date: r.transactionDate,
        created_at: r.createdAt.toISOString(),
      })),
      total_count: total,
      returned_count: rows.length,
    };
  },
};

export default tool;
