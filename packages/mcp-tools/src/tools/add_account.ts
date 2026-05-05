import { z } from 'zod';
import { ACCOUNT_TYPES, schema } from '@plot-money/shared';
import { fromPaise, toPaise } from '../_money.ts';
import type { ToolDef } from '../_types.ts';

const inputSchema = {
  name: z.string().min(1).max(120),
  type: z.enum(ACCOUNT_TYPES),
  starting_balance: z.number().default(0),
};

type Input = {
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  starting_balance: number;
};

type Output = {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
  created_at: string;
};

const tool: ToolDef<Input, Output> = {
  name: 'add_account',
  title: 'Add account',
  description:
    'Create a new financial account (savings, credit card, mutual fund, etc.). The starting_balance is the opening balance in rupees — subsequent transactions adjust it.',
  inputSchema,
  async handler(input, ctx) {
    const [created] = await ctx.db
      .insert(schema.accounts)
      .values({
        userId: ctx.userId,
        name: input.name,
        type: input.type,
        balancePaise: toPaise(input.starting_balance),
      })
      .returning();
    if (!created) throw new Error('add_account: insert returned no rows');
    return {
      id: created.id,
      name: created.name,
      type: created.type,
      currency: created.currency,
      balance: fromPaise(created.balancePaise),
      created_at: created.createdAt.toISOString(),
    };
  },
};

export default tool;
