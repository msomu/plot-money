import { z } from 'zod';
import { and, count, eq } from 'drizzle-orm';
import { AppError, schema, tenant } from '@plot-money/shared';
import type { ToolDef } from '../_types.ts';

const inputSchema = { account_id: z.string().min(1) };
type Input = { account_id: string };
type Output = { deleted: true; id: string };

const tool: ToolDef<Input, Output> = {
  name: 'delete_account',
  title: 'Delete account',
  description:
    'Delete an account. Fails with VALIDATION_ERROR if any transactions still reference it — delete or reassign those transactions first.',
  inputSchema,
  async handler(input, ctx) {
    const t = tenant(ctx.userId);
    const db = ctx.db;

    // Pre-check so the user gets a friendly message rather than a raw FK error.
    const [{ value: txnCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(schema.transactions)
      .where(and(t.transactions, eq(schema.transactions.accountId, input.account_id)));
    if (txnCount > 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Account has ${txnCount} transaction(s). Delete or move those first.`,
      );
    }

    const deleted = await db
      .delete(schema.accounts)
      .where(and(t.accounts, eq(schema.accounts.id, input.account_id)))
      .returning({ id: schema.accounts.id });
    if (deleted.length === 0) {
      throw new AppError('NOT_FOUND', `Account not found: ${input.account_id}`);
    }
    return { deleted: true as const, id: deleted[0]!.id };
  },
};

export default tool;
