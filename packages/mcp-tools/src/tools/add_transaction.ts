import { z } from 'zod';
import { eq, sql as rawSql } from 'drizzle-orm';
import { AppError, CATEGORIES, TRANSACTION_TYPES, schema, withRls } from '@plot-money/shared';
import { formatAmount, parseAmount, parseTransactionDate } from '../_helpers.ts';
import type { ToolDef } from '../_types.ts';

const inputSchema = {
  account_id: z.string().min(1),
  amount: z.number().positive(),
  type: z.enum(TRANSACTION_TYPES),
  category: z.enum(CATEGORIES),
  description: z.string().min(1).max(500),
  transaction_date: z.string().describe('YYYY-MM-DD, must not be in the future'),
};

type Input = {
  account_id: string;
  amount: number;
  type: (typeof TRANSACTION_TYPES)[number];
  category: (typeof CATEGORIES)[number];
  description: string;
  transaction_date: string;
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
  name: 'add_transaction',
  title: 'Add transaction',
  description:
    'Log a transaction (debit or credit). Updates the account balance atomically. Amount must be positive — direction is set by `type`.',
  inputSchema,
  async handler(input, ctx) {
    const date = parseTransactionDate(input.transaction_date);
    const delta = input.type === 'credit' ? input.amount : -input.amount;
    const amountStr = formatAmount(input.amount);

    return await withRls(ctx.userId, async (tx) => {
      // Ensure the account exists for this user (RLS already restricts the
      // update; we want a friendly NOT_FOUND if it doesn't).
      const accountRows = await tx
        .select({ id: schema.accounts.id })
        .from(schema.accounts)
        .where(eq(schema.accounts.id, input.account_id))
        .limit(1);
      if (accountRows.length === 0) {
        throw new AppError('NOT_FOUND', `Account not found: ${input.account_id}`);
      }

      const inserted = await tx
        .insert(schema.transactions)
        .values({
          userId: ctx.userId,
          accountId: input.account_id,
          amount: amountStr,
          type: input.type,
          category: input.category,
          description: input.description,
          transactionDate: date,
        })
        .returning();

      const updated = await tx
        .update(schema.accounts)
        .set({
          balance: rawSql`${schema.accounts.balance} + ${delta}`,
          updatedAt: rawSql`now()`,
        })
        .where(eq(schema.accounts.id, input.account_id))
        .returning({ balance: schema.accounts.balance });

      const t = inserted[0]!;
      return {
        transaction: {
          id: t.id,
          account_id: t.accountId,
          amount: parseAmount(t.amount),
          type: t.type,
          category: t.category,
          description: t.description,
          transaction_date: input.transaction_date,
          created_at: t.createdAt.toISOString(),
        },
        account_balance_after: parseAmount(updated[0]!.balance),
      };
    });
  },
};

export default tool;
