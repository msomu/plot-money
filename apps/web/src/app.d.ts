// See https://svelte.dev/docs/kit/types#app
declare global {
  namespace App {
    interface Locals {
      session: {
        user: { id: string; email: string; name: string; image?: string | null };
        session: { id: string; expiresAt: Date };
      } | null;
    }
  }
}

export {};
