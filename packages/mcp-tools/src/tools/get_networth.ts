import { sql as rawSql } from 'drizzle-orm';
import { schema, withRls } from '@plot-money/shared';
import { parseAmount } from '../_helpers.ts';
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
    const rows = await withRls(ctx.userId, async (tx) =>
      tx
        .select({
          type: schema.accounts.type,
          total: rawSql<string>`coalesce(sum(${schema.accounts.balance}), 0)`,
        })
        .from(schema.accounts)
        .groupBy(schema.accounts.type),
    );

    let totalAssets = 0;
    let totalLiabilities = 0;
    const byType: Array<{ type: string; value: number }> = [];

    for (const r of rows) {
      const balance = parseAmount(r.total);
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
