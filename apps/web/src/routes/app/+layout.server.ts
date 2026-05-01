// Server-side auth guard for everything under /app.
//
// Asks the API (via the Vite proxy in dev, same-origin in prod) for the
// current session. Forwards the cookie header from the incoming request
// so Better Auth can identify the user.

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? '';
  const res = await fetch('/api/auth/get-session', {
    headers: { cookie },
  });
  const session = (await res.json()) as App.Locals['session'];

  if (!session) {
    throw redirect(302, '/');
  }

  return { session };
};
