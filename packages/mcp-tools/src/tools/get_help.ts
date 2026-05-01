import { CATEGORIES } from '@plot-money/shared';
import type { ToolDef } from '../_types.ts';

const VERSION = '0.1.0';

const tool: ToolDef<Record<string, never>, GetHelpOutput> = {
  name: 'get_help',
  title: 'Get help',
  description:
    'Returns a description of plot.money, supported transaction categories, and example prompts. Useful when a user has just connected and asks "what can you do?".',
  inputSchema: {},
  async handler() {
    return {
      description:
        'plot.money is your personal finance assistant for India. You can manage accounts, log transactions, and get insights on your spending — all through chat.',
      supported_categories: [...CATEGORIES],
      example_prompts: [
        'Add a transaction of ₹450 for groceries today from my HDFC savings',
        'What did I spend on food this month?',
        'Show me my net worth',
        'List all transactions over ₹5000 in April',
      ],
      version: VERSION,
    };
  },
};

export type GetHelpOutput = {
  description: string;
  supported_categories: string[];
  example_prompts: string[];
  version: string;
};

export default tool;
