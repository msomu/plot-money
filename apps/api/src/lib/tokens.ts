// MCP bearer-token primitives.
//
// Raw tokens are 32 random bytes encoded as URL-safe base64 (44 chars before
// padding strip, 43 after). The DB only ever stores the HMAC-SHA256 of the
// token keyed by APP_SECRET — losing the database does not let an attacker
// forge tokens, and rotating APP_SECRET invalidates every issued token.
//
// We use timingSafeEqual on the hash comparison side (in middleware) but the
// hash itself is deterministic so we can also use it as a UNIQUE index lookup
// via `WHERE token_hash = $1`.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;
export const TOKEN_PREFIX = 'plot_';

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

export function looksLikeToken(value: string): boolean {
  // Cheap shape check before doing any DB work.
  return value.startsWith(TOKEN_PREFIX) && value.length >= TOKEN_PREFIX.length + 40;
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
