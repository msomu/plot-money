<script lang="ts">
  let { data } = $props();

  // Stubs for v0.1 — wired to real API endpoints in Phase 5 (Razorpay)
  // and Phase 6 (token CRUD).
  let subscriptionActive = $state(false);
  let tokens = $state<Array<{ id: string; name: string; lastUsedAt: string | null; createdAt: string }>>([]);
</script>

<svelte:head>
  <title>plot.money — dashboard</title>
</svelte:head>

<div class="mb-10">
  <h1 class="text-2xl font-semibold tracking-tight">Welcome back, {data.session?.user.name}</h1>
  <p class="mt-1 text-sm text-neutral-400">Manage your subscription and AI assistant tokens here.</p>
</div>

<!-- Subscription -->
<section class="mb-8 rounded-xl border border-white/10 bg-white/[0.02] p-6">
  <div class="mb-4 flex items-start justify-between">
    <div>
      <h2 class="text-lg font-medium">Subscription</h2>
      <p class="mt-1 text-sm text-neutral-400">
        ₹299/month · GST-inclusive · Cancel anytime
      </p>
    </div>
    {#if subscriptionActive}
      <span class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
        Active
      </span>
    {:else}
      <span class="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
        Not subscribed
      </span>
    {/if}
  </div>

  {#if !subscriptionActive}
    <button
      class="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200"
      disabled
    >
      Subscribe — coming in Phase 5
    </button>
    <p class="mt-3 text-xs text-neutral-500">
      Razorpay test-mode integration is not wired yet — the button will be live in the next deploy.
    </p>
  {/if}
</section>

<!-- MCP Tokens -->
<section class="rounded-xl border border-white/10 bg-white/[0.02] p-6">
  <div class="mb-4 flex items-start justify-between">
    <div>
      <h2 class="text-lg font-medium">MCP tokens</h2>
      <p class="mt-1 text-sm text-neutral-400">
        One token per AI assistant. Keep them safe — they grant full access to your data.
      </p>
    </div>
    <button
      class="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200 disabled:opacity-50"
      disabled={!subscriptionActive}
    >
      Generate token
    </button>
  </div>

  {#if !subscriptionActive}
    <p class="rounded-lg border border-white/5 bg-black/20 px-4 py-3 text-sm text-neutral-500">
      Subscribe first to generate tokens. Tokens are shown once at creation —
      copy them immediately into your AI assistant's settings.
    </p>
  {:else if tokens.length === 0}
    <p class="rounded-lg border border-white/5 bg-black/20 px-4 py-3 text-sm text-neutral-500">
      No tokens yet. Generate one to connect Claude Desktop or ChatGPT.
    </p>
  {:else}
    <ul class="divide-y divide-white/5">
      {#each tokens as token}
        <li class="flex items-center justify-between py-3">
          <div>
            <p class="text-sm font-medium">{token.name}</p>
            <p class="text-xs text-neutral-500">
              Created {token.createdAt}
              {#if token.lastUsedAt}· last used {token.lastUsedAt}{/if}
            </p>
          </div>
          <button class="text-sm text-red-400 hover:text-red-300">Revoke</button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<!-- Connect docs -->
<section class="mt-8 rounded-xl border border-white/10 bg-gradient-to-br from-violet-500/5 to-pink-500/5 p-6">
  <h2 class="text-lg font-medium">Connect to your AI assistant</h2>
  <p class="mt-1 text-sm text-neutral-400">
    Step-by-step setup for the most common MCP hosts:
  </p>
  <div class="mt-4 grid gap-3 md:grid-cols-2">
    <a
      href="https://github.com/msomu/plot-money/blob/main/docs/connect-claude-desktop.md"
      target="_blank"
      rel="noreferrer"
      class="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm transition hover:border-white/20"
    >
      Claude Desktop →
    </a>
    <a
      href="https://github.com/msomu/plot-money/blob/main/docs/connect-chatgpt.md"
      target="_blank"
      rel="noreferrer"
      class="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm transition hover:border-white/20"
    >
      ChatGPT (custom connectors) →
    </a>
  </div>
</section>
