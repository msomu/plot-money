import { z } from 'zod';
import { eq, sql as rawSql } from 'drizzle-orm';
import { AppError, schema, withRls } from '@plot-money/shared';
import { parseAmount } from '../_helpers.ts';
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

      // Reverse the original effect on the account balance.
      const reverseDelta =
        before.type === 'credit' ? -parseAmount(before.amount) : parseAmount(before.amount);

      await tx.delete(schema.transactions).where(eq(schema.transactions.id, input.transaction_id));

      const updated = await tx
        .update(schema.accounts)
        .set({
          balance: rawSql`${schema.accounts.balance} + ${reverseDelta}`,
          updatedAt: rawSql`now()`,
        })
        .where(eq(schema.accounts.id, before.accountId))
        .returning({ balance: schema.accounts.balance });

      return {
        deleted: true as const,
        id: input.transaction_id,
        account_balance_after: parseAmount(updated[0]!.balance),
      };
    });
  },
};

export default tool;
