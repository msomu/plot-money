// Better Auth Svelte client. Uses the same origin as the SvelteKit app
// because the Vite dev server proxies /api/* to the API. In production
// app.plot.money and api.plot.money will share the .plot.money cookie
// domain (configured on the server side).

import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient({
  baseURL: '', // same-origin — proxy in dev, shared subdomain cookie in prod
});

export const { signIn, signOut, useSession } = authClient;

export async function signInWithGoogle(callbackURL = '/app') {
  return authClient.signIn.social({ provider: 'google', callbackURL });
}
