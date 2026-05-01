<script lang="ts">
  import { signOut } from '$lib/auth-client';
  import { goto } from '$app/navigation';

  let { data, children } = $props();
  let signingOut = $state(false);

  async function handleSignOut() {
    signingOut = true;
    await signOut();
    await goto('/');
  }
</script>

<header class="border-b border-white/5">
  <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
    <a href="/app" class="font-semibold tracking-tight">
      plot<span class="text-violet-400">.</span>money
    </a>
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-3 text-sm">
        {#if data.session?.user.image}
          <img src={data.session.user.image} alt="" class="size-7 rounded-full" referrerpolicy="no-referrer" />
        {/if}
        <span class="text-neutral-400">{data.session?.user.email}</span>
      </div>
      <button
        onclick={handleSignOut}
        disabled={signingOut}
        class="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm transition hover:border-white/20 hover:bg-white/10 disabled:opacity-60"
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  </div>
</header>

<main class="mx-auto max-w-5xl px-6 py-12">
  {@render children()}
</main>
