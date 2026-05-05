// Shared types for MCP tool implementations.
//
// Each tool lives in its own file under tools/ and exports a default
// ToolDef. They're registered with the MCP server in apps/api at request
// time, so the userId is closure-captured and passed into every handler
// without any global state.

import type { ZodRawShape, ZodTypeAny } from 'zod';
import type { AppDB } from '@plot-money/shared';

export type ToolContext = {
  /** Resolved by the API auth middleware before the MCP transport runs. */
  userId: string;
  /** Drizzle handle bound to this request's D1 database. */
  db: AppDB;
};

export type ToolDef<Input = unknown, Output = unknown> = {
  /** Tool name as exposed over MCP (snake_case, matches the spec). */
  name: string;
  /** Short human-readable title shown in clients. */
  title: string;
  /** Markdown description — what the tool does, when to use it. */
  description: string;
  /**
   * Zod raw shape (field map) describing the tool's input. Empty `{}` for
   * parameter-less tools. The MCP SDK turns this into JSON Schema.
   */
  inputSchema: ZodRawShape;
  handler: (input: Input, ctx: ToolContext) => Promise<Output>;
};

/** Zod helpers re-exported so tool files don't each import from `zod`. */
export type { ZodTypeAny, ZodRawShape };
