// Server-side auth guard for everything under /app.
//
// Asks the api Worker (via service binding in prod, Vite proxy in dev) for
// the current session, forwarding the cookie from the incoming request.

import { redirect } from '@sveltejs/kit';
import { apiFetch } from '$lib/api';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  const res = await apiFetch(event, '/api/auth/get-session');
  const session = (await res.json()) as App.Locals['session'];

  if (!session) {
    throw redirect(302, '/');
  }

  return { session };
};
