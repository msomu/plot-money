# plot.money

> MCP-first personal finance backend for India. Manage your money via Claude Desktop or ChatGPT — no app, no UI to learn.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange.svg)](#status)
[![Built with Bun](https://img.shields.io/badge/built_with-bun-fbf0df.svg)](https://bun.sh)
[![Runs on Cloudflare](https://img.shields.io/badge/runs_on-Cloudflare-f38020.svg)](https://workers.cloudflare.com)

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
│  Claude Desktop /    │        │  Browser             │
│  ChatGPT / Cursor    │        │                      │
│  (MCP client)        │        │  https://plot.money  │
└──────────┬───────────┘        └──────────┬───────────┘
           │                               │
           │  https://plot.money/mcp       │  https://plot.money/*
           │  (Bearer token)               │  (Session cookie)
           ▼                               ▼
   ┌────────────────────────────────────────────────────────┐
   │  Cloudflare zone: plot.money                           │
   │  ─────────────────────────────────────────────────     │
   │  /mcp, /api/*, /health     → API Worker (Hono)         │
   │  /, /app, /_app/*, ...     → Web Worker (SvelteKit)    │
   └─────────────────────────────────┬──────────────────────┘
                                     │ via D1 binding
                                     ▼
                          ┌─────────────────────┐
                          │  D1 (SQLite at edge)│
                          └─────────────────────┘
```

**Single origin.** Both Workers serve from `plot.money` via path-based routing — no cross-subdomain auth ceremony, no CORS, one cookie scope. From a user's perspective, plot.money is plot.money.

**Tenant isolation** is enforced at the application layer via a `tenant(userId)` predicate that's required on every read/write of user-scoped tables. See [`packages/shared/src/db.ts`](./packages/shared/src/db.ts).

## Tech stack

- **Runtime:** [Cloudflare Workers](https://workers.cloudflare.com) (V8 isolates) end-to-end
- **API + MCP:** [Hono](https://hono.dev) + [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
- **Web:** [SvelteKit](https://kit.svelte.dev) + Tailwind v4 + Cloudflare adapter
- **Database:** [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) + [Drizzle ORM](https://orm.drizzle.team)
- **Storage:** [Cloudflare R2](https://developers.cloudflare.com/r2/) (reserved for v0.2 features)
- **Auth:** [Better Auth](https://www.better-auth.com) self-hosted (Google OAuth)
- **Payments:** [Razorpay](https://razorpay.com) — placeholder activate flow in v0.1, full integration later
- **LLM (categorization):** [OpenRouter](https://openrouter.ai) → Gemini 2.5 Flash Lite — coming
- **Hosting:** Cloudflare Workers + D1 + R2 (single platform, single bill)
- **Local dev:** [Bun](https://bun.sh) for tests + tooling, [wrangler](https://developers.cloudflare.com/workers/wrangler/) `dev --local` for the API

## Repository layout

```
apps/
  web/          SvelteKit landing + dashboard (CF Workers)
  api/          Hono API + MCP server (CF Workers + D1 + R2)
packages/
  shared/       Drizzle schema, Zod types, category enum, tenant() helper
  mcp-tools/    13 MCP tool implementations (one file per tool)
docs/           Setup, architecture, self-hosting guides
```

## Quick start (local dev)

> Requires [Bun ≥ 1.3](https://bun.sh/docs/installation), [Node ≥ 20](https://nodejs.org/) (for `wrangler`), and a [Cloudflare](https://cloudflare.com) account (free) for deploys. Local dev runs entirely on a Miniflare-backed in-process D1 — no CF account needed.

```bash
git clone https://github.com/msomu/plot-money.git
cd plot-money
bun install

# Apply migrations to a local D1 (creates .wrangler/state/...).
bun run --filter @plot-money/api db:migrate:local

# Drop secrets in apps/api/.env.local. wrangler picks them up automatically.
cp .env.example apps/api/.env.local
# fill BETTER_AUTH_SECRET, APP_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

# Two terminals:
bun run --filter @plot-money/api dev   # wrangler dev on :3000
bun run --filter @plot-money/web dev   # vite dev on :5173 (proxies to :3000)
```

## Connecting to your AI assistant

After signing up at [app.plot.money](https://app.plot.money) and generating a token:

- **Claude Desktop:** see [`docs/connect-claude-desktop.md`](./docs/connect-claude-desktop.md)
- **ChatGPT (custom connectors):** see [`docs/connect-chatgpt.md`](./docs/connect-chatgpt.md)

## Self-hosting

You can run plot.money entirely on your own Cloudflare account:

```bash
wrangler login
wrangler d1 create plot-money       # paste the id into apps/api/wrangler.toml
bun run --filter @plot-money/api db:migrate:remote
wrangler r2 bucket create plot-money-files
# Set secrets:
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put APP_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
bun run --filter @plot-money/api deploy
```

The web app deploys via the SvelteKit Cloudflare adapter — see [`apps/web`](./apps/web).

The hosted version exists for convenience and to fund development; the code is and will remain MIT.

## Contributing

PRs welcome. Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening one. Security issues: please email instead of filing public issues — see [`SECURITY.md`](./SECURITY.md).

## License

[MIT](./LICENSE) © Somasundaram Mahesh

---

Built in Bangalore. Questions? Open an issue or reach out on [X](https://x.com/msomu).
