import { z } from 'zod';
import { eq, sql as rawSql } from 'drizzle-orm';
import { AppError, CATEGORIES, TRANSACTION_TYPES, schema, withRls } from '@plot-money/shared';
import { dateOnly, formatAmount, parseAmount, parseTransactionDate } from '../_helpers.ts';
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
    const newDate = input.transaction_date
      ? parseTransactionDate(input.transaction_date)
      : undefined;

    return await withRls(ctx.userId, async (tx) => {
      const beforeRows = await tx
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.id, input.transaction_id))
        .limit(1);
      const before = beforeRows[0];
      if (!before) {
        throw new AppError('NOT_FOUND', `Transaction not found: ${input.transaction_id}`);
      }

      const newAmount = input.amount ?? parseAmount(before.amount);
      const newType = input.type ?? before.type;

      const oldDelta =
        before.type === 'credit' ? parseAmount(before.amount) : -parseAmount(before.amount);
      const newDelta = newType === 'credit' ? newAmount : -newAmount;
      const balanceChange = newDelta - oldDelta;

      const updated = await tx
        .update(schema.transactions)
        .set({
          amount: input.amount !== undefined ? formatAmount(input.amount) : undefined,
          type: input.type,
          category: input.category,
          description: input.description,
          ...(newDate ? { transactionDate: newDate } : {}),
          updatedAt: rawSql`now()`,
        })
        .where(eq(schema.transactions.id, input.transaction_id))
        .returning();

      let accountBalanceAfter: string;
      if (balanceChange !== 0) {
        const acc = await tx
          .update(schema.accounts)
          .set({
            balance: rawSql`${schema.accounts.balance} + ${balanceChange}`,
            updatedAt: rawSql`now()`,
          })
          .where(eq(schema.accounts.id, before.accountId))
          .returning({ balance: schema.accounts.balance });
        accountBalanceAfter = acc[0]!.balance;
      } else {
        const acc = await tx
          .select({ balance: schema.accounts.balance })
          .from(schema.accounts)
          .where(eq(schema.accounts.id, before.accountId))
          .limit(1);
        accountBalanceAfter = acc[0]!.balance;
      }

      const t = updated[0]!;
      return {
        transaction: {
          id: t.id,
          account_id: t.accountId,
          amount: parseAmount(t.amount),
          type: t.type,
          category: t.category,
          description: t.description,
          transaction_date: dateOnly(t.transactionDate),
          created_at: t.createdAt.toISOString(),
        },
        account_balance_after: parseAmount(accountBalanceAfter),
      };
    });
  },
};

export default tool;
