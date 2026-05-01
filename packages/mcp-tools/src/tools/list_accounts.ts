import { desc } from 'drizzle-orm';
import { schema, withRls } from '@plot-money/shared';
import { parseAmount } from '../_helpers.ts';
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
    const rows = await withRls(ctx.userId, (tx) =>
      tx
        .select({
          id: schema.accounts.id,
          name: schema.accounts.name,
          type: schema.accounts.type,
          currency: schema.accounts.currency,
          balance: schema.accounts.balance,
          createdAt: schema.accounts.createdAt,
        })
        .from(schema.accounts)
        .orderBy(desc(schema.accounts.createdAt)),
    );
    return {
      accounts: rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        currency: r.currency,
        balance: parseAmount(r.balance),
        created_at: r.createdAt.toISOString(),
      })),
    };
  },
};

export default tool;
