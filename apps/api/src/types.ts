// Hono context shape — variables added by middleware.

import type { AppDatabase } from '@plot-money/shared';

export type AuthMethod = 'session' | 'bearer';

export type AppEnv = {
  Variables: {
    /** Resolved user id from session or bearer token. */
    userId?: string;
    /** Which auth path matched. */
    authMethod?: AuthMethod;
    /** Token id from mcp_tokens row, when authMethod === 'bearer'. */
    tokenId?: string;
    /** Drizzle handle. Available for routes that don't need RLS. */
    db?: AppDatabase;
  };
};
