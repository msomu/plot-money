# plot.money

> MCP-first personal finance backend for India. Manage your money via Claude Desktop or ChatGPT — no app, no UI to learn.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange.svg)](#status)
[![Built with Bun](https://img.shields.io/badge/built_with-bun-fbf0df.svg)](https://bun.sh)

## What is this?

plot.money is an open-source personal finance backend that exposes itself as an [MCP](https://modelcontextprotocol.io) server. You connect it to Claude Desktop, ChatGPT, Cursor, or any MCP-compatible host, and manage your money entirely through chat:

- _"Add a transaction of ₹450 for groceries today from my HDFC savings"_
- _"What did I spend on food this month?"_
- _"Show me my net worth across all accounts"_
- _"List all transactions over ₹5000 in April"_

Built for Indian users (INR-first, GST-aware, UPI/SIP/MF categories baked in). Existing tools are either app-first (INDmoney, Jupiter) or US/EU-centric (Actual, Firefly III). This is neither.

## Status

**Pre-alpha — under active development.** Not yet ready for production use. The hosted version at [plot.money](https://plot.money) is not live yet. Star and watch for the v0.1 launch.

## Architecture

```
┌──────────────────────┐        ┌──────────────────────┐
│  Claude Desktop /    │        │  Web (SvelteKit)     │
│  ChatGPT / Cursor    │        │  Cloudflare Workers  │
│  (MCP client)        │        │  app.plot.money      │
└──────────┬───────────┘        └──────────┬───────────┘
           │ Bearer token                  │ Session cookie
           │ (streamable HTTP)             │ (Better Auth)
           ▼                               ▼
        ┌──────────────────────────────────────┐
        │  API + MCP server (Hono on Bun)       │
        │  Railway · api.plot.money             │
        └────────────────────┬──────────────────┘
                             │ Postgres RLS
                             ▼
                  ┌─────────────────────┐
                  │  Postgres (Neon)    │
                  └─────────────────────┘
```

Tenant isolation is enforced at the **Postgres row-level security** layer, not the application layer. Every request sets `app.current_user_id` before any query runs.

## Tech stack

- **Runtime:** [Bun](https://bun.sh) end-to-end
- **API + MCP:** [Hono](https://hono.dev) + [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
- **Web:** [SvelteKit](https://kit.svelte.dev) + Tailwind + shadcn-svelte
- **Database:** [Neon Postgres](https://neon.tech) + [Drizzle ORM](https://orm.drizzle.team)
- **Auth:** [Better Auth](https://www.better-auth.com) (Google OAuth)
- **Payments:** [Razorpay](https://razorpay.com) subscriptions (₹299/month)
- **LLM (categorization):** [OpenRouter](https://openrouter.ai) → Gemini 2.5 Flash Lite
- **Hosting:** Cloudflare Workers (web) + Railway (API)

## Repository layout

```
apps/
  web/          SvelteKit landing + dashboard
  api/          Hono API + MCP server
packages/
  shared/       Drizzle schema, Zod types, category enum
  mcp-tools/    MCP tool implementations (one file per tool)
docs/           Setup, architecture, self-hosting guides
```

## Quick start (local dev)

> Requires [Bun ≥ 1.3.0](https://bun.sh/docs/installation) and a Postgres database (use [Neon](https://neon.tech) free tier).

```bash
git clone https://github.com/msomu/plot-money.git
cd plot-money
bun install
cp .env.example apps/api/.env.local
cp .env.example apps/web/.env.local
# Fill in DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, etc.
bun run --filter @plot-money/api dev
bun run --filter @plot-money/web dev
```

Detailed setup: see [`docs/self-hosting.md`](./docs/self-hosting.md) (coming soon).

## Connecting to your AI assistant

After signing up at [app.plot.money](https://app.plot.money) and generating a token:

- **Claude Desktop:** see [`docs/connect-claude-desktop.md`](./docs/connect-claude-desktop.md)
- **ChatGPT (custom connectors):** see [`docs/connect-chatgpt.md`](./docs/connect-chatgpt.md)

## Self-hosting

You can run plot.money entirely on your own infrastructure. See [`docs/self-hosting.md`](./docs/self-hosting.md). The hosted version exists for convenience and to fund development; the code is and will remain MIT.

## Contributing

PRs welcome. Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening one. Security issues: please email instead of filing public issues — see [`SECURITY.md`](./SECURITY.md).

## License

[MIT](./LICENSE) © Somasundaram Mahesh

---

Built in Bangalore. Questions? Open an issue or reach out on [X](https://x.com/msomu).
