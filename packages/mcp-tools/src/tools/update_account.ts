import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { AppError, schema, tenant } from '@plot-money/shared';
import { fromPaise } from '../_money.ts';
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
    const t = tenant(ctx.userId);
    const [updated] = await ctx.db
      .update(schema.accounts)
      .set({ name: input.name, updatedAt: new Date() })
      .where(and(t.accounts, eq(schema.accounts.id, input.account_id)))
      .returning();
    if (!updated) {
      throw new AppError('NOT_FOUND', `Account not found: ${input.account_id}`);
    }
    return {
      id: updated.id,
      name: updated.name,
      type: updated.type,
      currency: updated.currency,
      balance: fromPaise(updated.balancePaise),
      created_at: updated.createdAt.toISOString(),
    };
  },
};

export default tool;
