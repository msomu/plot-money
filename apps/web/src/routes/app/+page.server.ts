// Loads tokens (and a placeholder subscription status) for the dashboard.
//
// Talks to the API via the Vite proxy in dev / shared subdomain in prod,
// forwarding the cookie so Better Auth can identify the user. Never
// returns the raw token — that only exists in the response of the
// generate POST below.

import type { PageServerLoad } from './$types';

type TokenRow = {
  id: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
};

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? '';

  const [tokensRes, subRes] = await Promise.all([
    fetch('/api/tokens', { headers: { cookie } }),
    fetch('/api/subscription/status', { headers: { cookie } }),
  ]);

  const tokens: TokenRow[] = tokensRes.ok
    ? ((await tokensRes.json()) as { tokens: TokenRow[] }).tokens
    : [];

  const sub = subRes.ok
    ? ((await subRes.json()) as { active: boolean; status: string | null })
    : { active: false, status: null };

  return { tokens, subscriptionActive: sub.active, subscriptionStatus: sub.status };
};
