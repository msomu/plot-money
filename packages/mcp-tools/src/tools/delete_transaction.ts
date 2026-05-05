import { z } from 'zod';
import { and, eq, sql as rawSql } from 'drizzle-orm';
import { AppError, schema, tenant } from '@plot-money/shared';
import { fromPaise } from '../_money.ts';
import type { ToolDef } from '../_types.ts';

const inputSchema = { transaction_id: z.string().min(1) };
type Input = { transaction_id: string };
type Output = { deleted: true; id: string; account_balance_after: number };

const tool: ToolDef<Input, Output> = {
  name: 'delete_transaction',
  title: 'Delete transaction',
  description: 'Delete a transaction. The associated account balance is recomputed atomically.',
  inputSchema,
  async handler(input, ctx) {
    const t = tenant(ctx.userId);
    const db = ctx.db;

    const [before] = await db
      .select()
      .from(schema.transactions)
      .where(and(t.transactions, eq(schema.transactions.id, input.transaction_id)))
      .limit(1);
    if (!before) {
      throw new AppError('NOT_FOUND', `Transaction not found: ${input.transaction_id}`);
    }

    // Reverse the original effect on the account balance.
    const reverseDeltaPaise = before.type === 'credit' ? -before.amountPaise : before.amountPaise;

    await db
      .delete(schema.transactions)
      .where(and(t.transactions, eq(schema.transactions.id, input.transaction_id)));

    const [updated] = await db
      .update(schema.accounts)
      .set({
        balancePaise: rawSql`${schema.accounts.balancePaise} + ${reverseDeltaPaise}`,
        updatedAt: new Date(),
      })
      .where(and(t.accounts, eq(schema.accounts.id, before.accountId)))
      .returning({ balancePaise: schema.accounts.balancePaise });
    if (!updated) throw new Error('delete_transaction: account balance update returned no rows');

    return {
      deleted: true as const,
      id: input.transaction_id,
      account_balance_after: fromPaise(updated.balancePaise),
    };
  },
};

export default tool;
