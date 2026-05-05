# Security Policy

## Reporting a vulnerability

plot.money handles personal financial data. We take security seriously.

**Please do not file a public GitHub issue for security vulnerabilities.**

Instead, email: **msomasundaram93@gmail.com** with the subject line `[plot.money security]`.

Include:

- Description of the issue
- Steps to reproduce
- Affected component (web, API, MCP server, schema, etc.)
- Your assessment of impact

You can expect a first response within 72 hours. We'll work with you on a fix and coordinated disclosure timeline.

## Scope

In scope:

- Tenant isolation bypass (one user reading or modifying another user's data)
- Auth bypass (accessing API without a valid session or token)
- MCP token leakage or improper hashing
- SQL injection, XSS, CSRF
- Razorpay webhook signature bypass
- Privilege escalation via DB role misuse

Out of scope (please don't report these):

- Missing security headers on the marketing landing page
- Rate limiting on public-facing routes (we know — being added in v0.2)
- Self-XSS requiring victim to paste content into devtools
- Issues in dependencies that don't affect plot.money's runtime
- Reports from automated scanners without verified impact

## Known design decisions

These are intentional, not vulnerabilities:

- MCP bearer tokens are shown to the user **once** at generation time. We store only the HMAC-SHA256 hash keyed by `APP_SECRET`. If lost, generate a new one.
- Tenant isolation is enforced at the **application layer** via the `tenant(userId)` predicate in `packages/shared/src/db.ts`. Every query into user-scoped tables (`accounts`, `transactions`, `mcp_tokens`, `subscriptions`) MUST include `t.<table>` in its `WHERE`. Code review and integration tests are the floor here — bugs in this layer that omit the predicate would leak data across users.
- Razorpay handles all card data — we never see, store, or transmit card numbers.

## Self-hosters

If you self-host, you are responsible for:

- Generating strong values for `APP_SECRET` and `BETTER_AUTH_SECRET` (`openssl rand -hex 32`)
- Storing them as Cloudflare Worker secrets (`wrangler secret put`), never in source
- Keeping `.env.local` out of version control (it's in `.gitignore` already; double-check before committing)
- Restricting your Cloudflare API tokens to least privilege (D1 + Workers + R2 only — not your account-wide token)
- TLS is automatic on Cloudflare; just don't disable it

## Acknowledgements

Researchers who report valid issues will be credited here (with permission) after the fix ships.
