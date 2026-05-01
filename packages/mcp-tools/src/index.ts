// Tool registration entry point.
//
// Exports `registerTools(server, ctx)` which the API layer calls per
// request — userId comes from the auth middleware and is closure-captured
// into every handler. Tool implementations themselves are pure: they
// take (input, ctx) and return JSON-serialisable values.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AppError } from '@plot-money/shared';
import getHelp from './tools/get_help.ts';
import listAccounts from './tools/list_accounts.ts';
import addAccount from './tools/add_account.ts';
import updateAccount from './tools/update_account.ts';
import deleteAccount from './tools/delete_account.ts';
import listTransactions from './tools/list_transactions.ts';
import addTransaction from './tools/add_transaction.ts';
import updateTransaction from './tools/update_transaction.ts';
import deleteTransaction from './tools/delete_transaction.ts';
import getBalance from './tools/get_balance.ts';
import getCashFlow from './tools/get_cash_flow.ts';
import getSpendingByCategory from './tools/get_spending_by_category.ts';
import getNetworth from './tools/get_networth.ts';
import type { ToolContext, ToolDef } from './_types.ts';

export const allTools: ToolDef<unknown, unknown>[] = [
  getHelp,
  listAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  listTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  getBalance,
  getCashFlow,
  getSpendingByCategory,
  getNetworth,
] as ToolDef<unknown, unknown>[];

export function registerTools(server: McpServer, ctx: ToolContext): void {
  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (input: unknown) => {
        try {
          const result = await tool.handler(input, ctx);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent: result as Record<string, unknown>,
          };
        } catch (err) {
          // AppError carries our error code; everything else gets bucketed.
          const wrapped =
            err instanceof AppError
              ? err
              : new AppError('INTERNAL', err instanceof Error ? err.message : 'Unknown error');
          // The MCP SDK marks isError so clients render it as a tool error.
          return {
            isError: true,
            content: [{ type: 'text', text: JSON.stringify(wrapped.toJSON()) }],
          };
        }
      },
    );
  }
}

export type { ToolContext, ToolDef } from './_types.ts';
