// Better Auth Svelte client.
//
// Single-origin deployment: in dev the Vite proxy forwards /api/* to
// localhost:3000; in prod the api Worker owns /api/* on plot.money
// directly. Either way, relative URLs Just Work and the session cookie
// is naturally same-origin.

import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient({
  baseURL: '',
});

export const { signIn, signOut, useSession } = authClient;

export async function signInWithGoogle(callbackURL = '/app') {
  return authClient.signIn.social({ provider: 'google', callbackURL });
}
