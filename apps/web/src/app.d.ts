// See https://svelte.dev/docs/kit/types#app
declare global {
  namespace App {
    interface Locals {
      session: {
        user: { id: string; email: string; name: string; image?: string | null };
        session: { id: string; expiresAt: Date };
      } | null;
    }

    interface Platform {
      env: {
        // Service binding to the api Worker (defined in wrangler.toml under
        // env.{production,preview}.services). SSR load functions use this
        // instead of public fetch to avoid the CF self-loopback issue.
        // In dev (vite) this is undefined; loaders fall back to public fetch.
        API?: { fetch: typeof fetch };
      };
    }
  }
}

export {};
