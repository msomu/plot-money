import { z } from 'zod';
import { and, eq, sql as rawSql } from 'drizzle-orm';
import { AppError, CATEGORIES, TRANSACTION_TYPES, schema, tenant } from '@plot-money/shared';
import { parseTransactionDate } from '../_helpers.ts';
import { fromPaise, toPaise } from '../_money.ts';
import type { ToolDef } from '../_types.ts';

const inputSchema = {
  transaction_id: z.string().min(1),
  amount: z.number().positive().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  category: z.enum(CATEGORIES).optional(),
  description: z.string().min(1).max(500).optional(),
  transaction_date: z.string().optional(),
};

type Input = {
  transaction_id: string;
  amount?: number;
  type?: (typeof TRANSACTION_TYPES)[number];
  category?: (typeof CATEGORIES)[number];
  description?: string;
  transaction_date?: string;
};

type Output = {
  transaction: {
    id: string;
    account_id: string;
    amount: number;
    type: string;
    category: string;
    description: string;
    transaction_date: string;
    created_at: string;
  };
  account_balance_after: number;
};

const tool: ToolDef<Input, Output> = {
  name: 'update_transaction',
  title: 'Update transaction',
  description:
    'Update fields of an existing transaction. If amount or type changes, the account balance is recomputed atomically. account_id cannot be changed (delete and re-create instead).',
  inputSchema,
  async handler(input, ctx) {
    const t = tenant(ctx.userId);
    const db = ctx.db;
    const newDateStr = input.transaction_date
      ? parseTransactionDate(input.transaction_date)
      : undefined;

    const [before] = await db
      .select()
      .from(schema.transactions)
      .where(and(t.transactions, eq(schema.transactions.id, input.transaction_id)))
      .limit(1);
    if (!before) {
      throw new AppError('NOT_FOUND', `Transaction not found: ${input.transaction_id}`);
    }

    const newAmountPaise = input.amount !== undefined ? toPaise(input.amount) : before.amountPaise;
    const newType = input.type ?? before.type;

    const oldDelta = before.type === 'credit' ? before.amountPaise : -before.amountPaise;
    const newDelta = newType === 'credit' ? newAmountPaise : -newAmountPaise;
    const balanceChangePaise = newDelta - oldDelta;

    const [updated] = await db
      .update(schema.transactions)
      .set({
        amountPaise: input.amount !== undefined ? newAmountPaise : undefined,
        type: input.type,
        category: input.category,
        description: input.description,
        ...(newDateStr ? { transactionDate: newDateStr } : {}),
        updatedAt: new Date(),
      })
      .where(and(t.transactions, eq(schema.transactions.id, input.transaction_id)))
      .returning();
    if (!updated) throw new Error('update_transaction: update returned no rows');

    let accountBalancePaise: number;
    if (balanceChangePaise !== 0) {
      const [acc] = await db
        .update(schema.accounts)
        .set({
          balancePaise: rawSql`${schema.accounts.balancePaise} + ${balanceChangePaise}`,
          updatedAt: new Date(),
        })
        .where(and(t.accounts, eq(schema.accounts.id, before.accountId)))
        .returning({ balancePaise: schema.accounts.balancePaise });
      if (!acc) throw new Error('update_transaction: account balance update returned no rows');
      accountBalancePaise = acc.balancePaise;
    } else {
      const [acc] = await db
        .select({ balancePaise: schema.accounts.balancePaise })
        .from(schema.accounts)
        .where(and(t.accounts, eq(schema.accounts.id, before.accountId)))
        .limit(1);
      if (!acc) throw new Error('update_transaction: account read returned no rows');
      accountBalancePaise = acc.balancePaise;
    }

    return {
      transaction: {
        id: updated.id,
        account_id: updated.accountId,
        amount: fromPaise(updated.amountPaise),
        type: updated.type,
        category: updated.category,
        description: updated.description,
        transaction_date: updated.transactionDate,
        created_at: updated.createdAt.toISOString(),
      },
      account_balance_after: fromPaise(accountBalancePaise),
    };
  },
};

export default tool;
