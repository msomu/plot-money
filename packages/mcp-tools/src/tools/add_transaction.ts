import { z } from 'zod';
import { and, eq, sql as rawSql } from 'drizzle-orm';
import { AppError, CATEGORIES, TRANSACTION_TYPES, schema, tenant } from '@plot-money/shared';
import { parseRupeeAmount, parseTransactionDate } from '../_helpers.ts';
import { fromPaise, toPaise } from '../_money.ts';
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
    'Log a transaction (debit or credit). Updates the account balance atomically. Amount must be positive in rupees — direction is set by `type`.',
  inputSchema,
  async handler(input, ctx) {
    const t = tenant(ctx.userId);
    const db = ctx.db;
    const dateStr = parseTransactionDate(input.transaction_date);
    const amount = parseRupeeAmount(input.amount);
    const amountPaise = toPaise(amount);
    const deltaPaise = input.type === 'credit' ? amountPaise : -amountPaise;

    // Ensure the account exists for this user (tenant predicate scopes the
    // lookup; raise a friendly NOT_FOUND when missing).
    const [account] = await db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(and(t.accounts, eq(schema.accounts.id, input.account_id)))
      .limit(1);
    if (!account) {
      throw new AppError('NOT_FOUND', `Account not found: ${input.account_id}`);
    }

    const [inserted] = await db
      .insert(schema.transactions)
      .values({
        userId: ctx.userId,
        accountId: input.account_id,
        amountPaise,
        type: input.type,
        category: input.category,
        description: input.description,
        transactionDate: dateStr,
      })
      .returning();
    if (!inserted) throw new Error('add_transaction: insert returned no rows');

    const [updatedAccount] = await db
      .update(schema.accounts)
      .set({
        balancePaise: rawSql`${schema.accounts.balancePaise} + ${deltaPaise}`,
        updatedAt: new Date(),
      })
      .where(and(t.accounts, eq(schema.accounts.id, input.account_id)))
      .returning({ balancePaise: schema.accounts.balancePaise });
    if (!updatedAccount) throw new Error('add_transaction: balance update returned no rows');

    return {
      transaction: {
        id: inserted.id,
        account_id: inserted.accountId,
        amount: fromPaise(inserted.amountPaise),
        type: inserted.type,
        category: inserted.category,
        description: inserted.description,
        transaction_date: inserted.transactionDate,
        created_at: inserted.createdAt.toISOString(),
      },
      account_balance_after: fromPaise(updatedAccount.balancePaise),
    };
  },
};

export default tool;
