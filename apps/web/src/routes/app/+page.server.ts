// Loads tokens + subscription status for the dashboard.
//
// Talks to the api Worker via the apiFetch helper (service binding in
// prod, Vite proxy in dev). Never returns the raw token — that only
// lives in the response of the generate POST.

import { apiFetch } from '$lib/api';
import type { PageServerLoad } from './$types';

type TokenRow = {
  id: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
};

export const load: PageServerLoad = async (event) => {
  const [tokensRes, subRes] = await Promise.all([
    apiFetch(event, '/api/tokens'),
    apiFetch(event, '/api/subscription/status'),
  ]);

  const tokens: TokenRow[] = tokensRes.ok
    ? ((await tokensRes.json()) as { tokens: TokenRow[] }).tokens
    : [];

  const sub = subRes.ok
    ? ((await subRes.json()) as { active: boolean; status: string | null })
    : { active: false, status: null };

  return { tokens, subscriptionActive: sub.active, subscriptionStatus: sub.status };
};
