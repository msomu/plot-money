// Catalog of every MCP tool plot.money exposes — used to render the
// "available tools" + "capabilities" sections of the dashboard.
//
// Source of truth for the tool list lives in @plot-money/mcp-tools/src/tools.
// This duplicates names + descriptions for client-side display because the
// SvelteKit Worker can't import the api package without bundling its
// drizzle-orm dependency. Keep this file in sync when tools change.

export type ToolDef = {
  name: string;
  description: string;
};

export type ToolCategory = {
  id: string;
  name: string;
  blurb: string;
  emoji: string;
  /** Tailwind classes for the colored card on the capabilities grid. */
  accent: string;
  tools: ToolDef[];
};

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: 'accounts',
    name: 'Accounts',
    blurb: 'create, rename, list, delete accounts',
    emoji: '🏦',
    accent: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20',
    tools: [
      { name: 'list_accounts', description: 'List every financial account belonging to you.' },
      {
        name: 'add_account',
        description:
          'Create a new account (savings, credit_card, mutual_fund, stock, etc.) with an opening balance.',
      },
      { name: 'update_account', description: 'Rename an account.' },
      {
        name: 'delete_account',
        description: 'Delete an account. Fails if it still has transactions.',
      },
    ],
  },
  {
    id: 'transactions',
    name: 'Transactions',
    blurb: 'log, list, edit, delete transactions',
    emoji: '💸',
    accent: 'from-violet-500/20 to-violet-500/5 border-violet-500/20',
    tools: [
      {
        name: 'list_transactions',
        description:
          'List transactions with filters: date range, category, account, amount range, type.',
      },
      {
        name: 'add_transaction',
        description: 'Log a debit or credit transaction. Updates account balance atomically.',
      },
      {
        name: 'update_transaction',
        description: 'Update fields of a transaction. Recomputes account balance if needed.',
      },
      {
        name: 'delete_transaction',
        description: 'Delete a transaction. Reverses its effect on the account balance.',
      },
    ],
  },
  {
    id: 'insights',
    name: 'Insights',
    blurb: 'balance, cash flow, spending breakdown, net worth',
    emoji: '📊',
    accent: 'from-pink-500/20 to-pink-500/5 border-pink-500/20',
    tools: [
      {
        name: 'get_balance',
        description: 'Get the balance of one account, or all accounts with a grand total.',
      },
      {
        name: 'get_cash_flow',
        description:
          'Income, expenses, and net for a date range. Optionally scoped to one account.',
      },
      {
        name: 'get_spending_by_category',
        description: 'Spending breakdown by category for a date range, with percentages.',
      },
      {
        name: 'get_networth',
        description:
          'Net worth grouped by account type. Credit-card balances subtracted as liabilities.',
      },
    ],
  },
  {
    id: 'help',
    name: 'Help',
    blurb: "discover what's possible",
    emoji: '✨',
    accent: 'from-amber-500/20 to-amber-500/5 border-amber-500/20',
    tools: [
      {
        name: 'get_help',
        description:
          'Returns a description of plot.money + the supported transaction categories + example prompts.',
      },
    ],
  },
];

export const TOTAL_TOOLS = TOOL_CATEGORIES.reduce((acc, c) => acc + c.tools.length, 0);
