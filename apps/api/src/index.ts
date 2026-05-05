// Cloudflare Workers entry point.
//
// `wrangler dev` looks for the default export with a `fetch` handler. Hono's
// `app.fetch` matches the signature exactly: (Request, Env, ExecutionContext)
// → Promise<Response>.

import { createApp } from './app.ts';
import type { Bindings } from './types.ts';

const app = createApp();

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Bindings>;
