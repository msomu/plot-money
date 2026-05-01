// MCP transport mounted at POST /mcp.
//
// Stateless mode: every request gets its own McpServer + transport pair so
// the userId can be closure-captured per request — no AsyncLocalStorage
// needed. The SDK's WebStandardStreamableHTTPServerTransport already
// speaks Web Standard Request/Response, which Hono on Bun hands us
// directly via `c.req.raw`.

import type { Context } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { registerTools } from '@plot-money/mcp-tools';
import { AppError } from '@plot-money/shared';
import type { AppEnv } from '../types.ts';

const NAME = 'plot.money';
const VERSION = '0.1.0';

export async function handleMcpRequest(c: Context<AppEnv>): Promise<Response> {
  const userId = c.get('userId');
  if (!userId) {
    // Should never happen — auth middleware runs first — but guard so a
    // misconfigured route doesn't silently leak unauthenticated access.
    throw new AppError('UNAUTHORIZED', 'No user context for MCP request');
  }

  const server = new McpServer({ name: NAME, version: VERSION });
  registerTools(server, { userId });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — each request stands alone
    enableJsonResponse: true, // simple POST -> JSON, no SSE for v0.1
  });

  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
}
