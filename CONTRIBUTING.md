# Contributing to plot.money

Thanks for considering a contribution. plot.money is in pre-alpha, so expect rapid change and rough edges.

## Before you start

- **Open an issue first** for anything non-trivial. A 30-line bug fix doesn't need a discussion. A new MCP tool, schema change, or new dependency does.
- **Search existing issues** — your idea might already be on the roadmap or explicitly out of scope. See the PRD-defined non-goals before proposing big features.
- **Security issues** — do **not** open a public issue. Email per [`SECURITY.md`](./SECURITY.md).

## Development setup

Requirements:

- [Bun](https://bun.sh) ≥ 1.3.0
- A Postgres database (free tier on [Neon](https://neon.tech) is enough)
- Google OAuth client (for auth flow testing)

```bash
git clone https://github.com/msomu/plot-money.git
cd plot-money
bun install
cp .env.example apps/api/.env.local   # fill in real values
cp .env.example apps/web/.env.local
```

## Running locally

```bash
bun run --filter @plot-money/api dev
bun run --filter @plot-money/web dev
```

## Tests, types, lint

Run before opening a PR:

```bash
bun run typecheck
bun run lint
bun run test
```

## Code style

- TypeScript strict mode, no `any` without a comment explaining why.
- 2-space indent, single quotes, trailing commas (Prettier-enforced).
- Comments only when the _why_ is non-obvious. Don't restate what code does.
- Keep diffs minimal — no drive-by reformatting in feature PRs.

## Commits

Conventional Commits style preferred but not enforced:

- `feat(api): add get_networth tool`
- `fix(web): handle expired token in dashboard`
- `chore: bump drizzle to 0.34`
- `docs: clarify Neon setup steps`

## PR checklist

- [ ] Tests added or updated (especially for MCP tools and tenant isolation)
- [ ] `bun run typecheck && bun run lint && bun run test` all green locally
- [ ] No real secrets, API keys, or PII in the diff
- [ ] If adding a dependency, justified in PR description
- [ ] Updated relevant docs (README, `docs/`)

## What we won't accept (yet)

- New MCP tools outside the v0.1 scope (see PRD §5)
- Bank auto-sync via Account Aggregator — planned for v0.2, blocked on regulatory work
- UI for transaction views — the MCP-first stance is intentional
- Custom categories — v1 is hardcoded enum on purpose

## License

By contributing, you agree your contribution is licensed under the MIT License.
