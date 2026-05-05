import { sql as rawSql } from 'drizzle-orm';
import { schema, tenant } from '@plot-money/shared';
import { fromPaise } from '../_money.ts';
import type { ToolDef } from '../_types.ts';

type Output = {
  as_of: string;
  by_type: Array<{ type: string; value: number }>;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  currency: string;
};

const LIABILITY_TYPES = new Set(['credit_card']);

const tool: ToolDef<Record<string, never>, Output> = {
  name: 'get_networth',
  title: 'Get net worth',
  description:
    'Returns total net worth grouped by account type. Credit-card balances are subtracted as liabilities. Convention: credit_card.balance is the amount owed.',
  inputSchema: {},
  async handler(_input, ctx) {
    const t = tenant(ctx.userId);
    const rows = await ctx.db
      .select({
        type: schema.accounts.type,
        totalPaise: rawSql<number>`coalesce(sum(${schema.accounts.balancePaise}), 0)`,
      })
      .from(schema.accounts)
      .where(t.accounts)
      .groupBy(schema.accounts.type);

    let totalAssets = 0;
    let totalLiabilities = 0;
    const byType: Array<{ type: string; value: number }> = [];

    for (const r of rows) {
      const balance = fromPaise(Number(r.totalPaise));
      if (LIABILITY_TYPES.has(r.type)) {
        totalLiabilities += balance;
        byType.push({ type: r.type, value: -balance });
      } else {
        totalAssets += balance;
        byType.push({ type: r.type, value: balance });
      }
    }

    return {
      as_of: new Date().toISOString(),
      by_type: byType.sort((a, b) => b.value - a.value),
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      net_worth: totalAssets - totalLiabilities,
      currency: 'INR',
    };
  },
};

export default tool;
