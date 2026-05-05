// Helper that picks the right way to talk to the api Worker from inside
// a SvelteKit SSR loader.
//
//   In dev (vite):  no platform.env.API binding → use the global fetch
//                   which the Vite proxy forwards to localhost:3000.
//   In prod (CF):   platform.env.API.fetch goes Worker-to-Worker directly,
//                   skipping the public network and the 522 self-loopback
//                   that Cloudflare returns when a Worker tries to reach
//                   another Worker on the same zone via public fetch.

type LoadEvent = {
  platform?: App.Platform;
  fetch: typeof fetch;
  request: Request;
};

export async function apiFetch(
  event: LoadEvent,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const cookie = event.request.headers.get('cookie') ?? '';
  const headers = new Headers(init?.headers);
  if (cookie) headers.set('cookie', cookie);

  const api = event.platform?.env.API;
  if (api) {
    // Service binding wants an absolute URL — the host doesn't matter,
    // routing happens via the binding, not DNS.
    return api.fetch(`https://api.internal${path}`, { ...init, headers });
  }
  return event.fetch(path, { ...init, headers });
}
