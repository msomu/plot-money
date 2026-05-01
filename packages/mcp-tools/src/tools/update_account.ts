import { z } from 'zod';
import { eq, sql as rawSql } from 'drizzle-orm';
import { AppError, schema, withRls } from '@plot-money/shared';
import { parseAmount } from '../_helpers.ts';
import type { ToolDef } from '../_types.ts';

const inputSchema = {
  account_id: z.string().min(1),
  name: z.string().min(1).max(120),
};

type Input = { account_id: string; name: string };
type Output = {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
  created_at: string;
};

const tool: ToolDef<Input, Output> = {
  name: 'update_account',
  title: 'Update account',
  description:
    'Rename an account. Balance is computed from transactions and cannot be changed directly.',
  inputSchema,
  async handler(input, ctx) {
    const updated = await withRls(ctx.userId, async (tx) => {
      const rows = await tx
        .update(schema.accounts)
        .set({ name: input.name, updatedAt: rawSql`now()` })
        .where(eq(schema.accounts.id, input.account_id))
        .returning();
      return rows[0];
    });
    if (!updated) {
      throw new AppError('NOT_FOUND', `Account not found: ${input.account_id}`);
    }
    return {
      id: updated.id,
      name: updated.name,
      type: updated.type,
      currency: updated.currency,
      balance: parseAmount(updated.balance),
      created_at: updated.createdAt.toISOString(),
    };
  },
};

export default tool;
