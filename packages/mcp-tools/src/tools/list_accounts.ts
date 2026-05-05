import { desc } from 'drizzle-orm';
import { schema, tenant } from '@plot-money/shared';
import { fromPaise } from '../_money.ts';
import type { ToolDef } from '../_types.ts';

type Output = {
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    currency: string;
    balance: number;
    created_at: string;
  }>;
};

const tool: ToolDef<Record<string, never>, Output> = {
  name: 'list_accounts',
  title: 'List accounts',
  description: 'Returns every financial account belonging to the authenticated user.',
  inputSchema: {},
  async handler(_input, ctx) {
    const t = tenant(ctx.userId);
    const rows = await ctx.db
      .select({
        id: schema.accounts.id,
        name: schema.accounts.name,
        type: schema.accounts.type,
        currency: schema.accounts.currency,
        balancePaise: schema.accounts.balancePaise,
        createdAt: schema.accounts.createdAt,
      })
      .from(schema.accounts)
      .where(t.accounts)
      .orderBy(desc(schema.accounts.createdAt));
    return {
      accounts: rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        currency: r.currency,
        balance: fromPaise(r.balancePaise),
        created_at: r.createdAt.toISOString(),
      })),
    };
  },
};

export default tool;
