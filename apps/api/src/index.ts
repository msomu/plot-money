// Entry point. Boots Bun's HTTP server using the Hono app factory.

import { createApp } from './app.ts';
import { loadEnv } from './env.ts';

const env = loadEnv();
const app = createApp();

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`plot.money api listening on http://localhost:${server.port}`);
