<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { MCP_CLIENTS } from '$lib/mcp-clients';
  import { TOOL_CATEGORIES, TOTAL_TOOLS } from '$lib/tool-catalog';

  let { data } = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  let newName = $state('');
  let generating = $state(false);
  let generatedToken = $state<{ name: string; token: string } | null>(null);
  let copyState = $state<'idle' | 'copied'>('idle');
  let revokingId = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);
  let subscribing = $state(false);
  let subscribeError = $state<string | null>(null);
  let snippetCopied = $state<string | null>(null);

  async function subscribe() {
    subscribing = true;
    subscribeError = null;
    try {
      const res = await fetch('/api/subscription/activate', { method: 'POST' });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Failed (${res.status})`);
      }
      await invalidateAll();
    } catch (err) {
      subscribeError = err instanceof Error ? err.message : 'Failed to subscribe';
    } finally {
      subscribing = false;
    }
  }

  function openGenerate() {
    if (!data.subscriptionActive) return;
    newName = '';
    generatedToken = null;
    errorMsg = null;
    copyState = 'idle';
    dialog?.showModal();
  }

  function closeDialog() {
    dialog?.close();
    generatedToken = null;
    newName = '';
    errorMsg = null;
  }

  async function generate(e: SubmitEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    generating = true;
    errorMsg = null;
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Failed (${res.status})`);
      }
      const body = (await res.json()) as { name: string; token: string };
      generatedToken = { name: body.name, token: body.token };
      await invalidateAll();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Failed to generate token';
    } finally {
      generating = false;
    }
  }

  async function copyToken() {
    if (!generatedToken) return;
    try {
      await navigator.clipboard.writeText(generatedToken.token);
      copyState = 'copied';
      setTimeout(() => (copyState = 'idle'), 1800);
    } catch {
      // Clipboard might be blocked — user can still select the textarea.
    }
  }

  async function copySnippet(id: string, snippet: string) {
    try {
      await navigator.clipboard.writeText(snippet);
      snippetCopied = id;
      setTimeout(() => (snippetCopied = null), 1500);
    } catch {
      // ignore
    }
  }

  async function revoke(id: string, name: string) {
    if (!confirm(`Revoke "${name}"? Any AI assistant using it will lose access immediately.`)) return;
    revokingId = id;
    try {
      const res = await fetch(`/api/tokens/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Failed (${res.status})`);
      }
      await invalidateAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke');
    } finally {
      revokingId = null;
    }
  }

  function fmtDate(iso: string | null): string {
    if (!iso) return 'never';
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }
</script>

<svelte:head>
  <title>plot.money — MCP setup</title>
</svelte:head>

<div class="mb-10">
  <h1 class="text-3xl font-semibold tracking-tight">MCP setup</h1>
  <p class="mt-1 text-sm text-neutral-400">
    Connect plot.money to your AI assistant in three steps.
  </p>
</div>

<!-- Subscription gate (if not subscribed, this dominates the page). -->
{#if !data.subscriptionActive}
  <section
    class="mb-10 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-6"
  >
    <h2 class="text-lg font-medium">Subscribe to enable your token</h2>
    <p class="mt-1 mb-4 text-sm text-neutral-400">
      ₹299/month — placeholder activation in v0.1, real Razorpay billing later.
    </p>
    <button
      onclick={subscribe}
      disabled={subscribing}
      class="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200 disabled:opacity-60"
    >
      {subscribing ? 'Subscribing…' : 'Subscribe — instant activation'}
    </button>
    {#if subscribeError}
      <p class="mt-3 text-xs text-red-400">{subscribeError}</p>
    {/if}
  </section>
{/if}

<!-- 1. Generate your token -->
<section class="mb-10">
  <h2 class="mb-4 text-lg font-medium">1. Generate your token</h2>

  <button
    onclick={openGenerate}
    disabled={!data.subscriptionActive}
    class="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] py-4 text-sm font-medium transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
  >
    <span aria-hidden="true">🔑</span>
    Generate Token
  </button>

  <div class="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
    <span aria-hidden="true" class="text-amber-300">ⓘ</span>
    <span class="text-amber-200/90">
      Keep your token safe — anyone with it can read and modify your money.
    </span>
  </div>

  {#if data.tokens.length > 0}
    <div class="mt-5 rounded-xl border border-white/10 bg-white/[0.02]">
      <ul class="divide-y divide-white/5">
        {#each data.tokens as token (token.id)}
          <li class="flex items-center justify-between px-4 py-3">
            <div>
              <p class="text-sm font-medium">{token.name}</p>
              <p class="text-xs text-neutral-500">
                Created {fmtDate(token.created_at)} · last used {fmtDate(token.last_used_at)}
              </p>
            </div>
            <button
              onclick={() => revoke(token.id, token.name)}
              disabled={revokingId === token.id}
              class="text-sm text-red-400 transition hover:text-red-300 disabled:opacity-50"
            >
              {revokingId === token.id ? 'Revoking…' : 'Revoke'}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>

<!-- 2. Add to your MCP client -->
<section class="mb-10">
  <h2 class="mb-4 text-lg font-medium">2. Add to your MCP client</h2>
  <div class="space-y-2">
    {#each MCP_CLIENTS as client}
      <details
        class="group rounded-xl border border-white/10 bg-white/[0.02] open:bg-white/[0.04]"
      >
        <summary class="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
          {client.name}
          <span class="text-neutral-500 transition group-open:rotate-180">▾</span>
        </summary>
        <div class="px-4 pt-1 pb-4">
          {#if client.pathHint}
            <p class="mb-3 whitespace-pre-line text-xs text-neutral-400">{client.pathHint}</p>
          {/if}
          <div class="relative">
            <pre
              class="overflow-x-auto rounded-md border border-white/10 bg-black/40 p-4 text-xs leading-relaxed text-neutral-200">
<code>{client.snippet}</code></pre>
            <button
              onclick={() => copySnippet(client.id, client.snippet)}
              class="absolute top-2 right-2 rounded-md border border-white/10 bg-neutral-900/80 px-2 py-1 text-xs text-neutral-300 transition hover:bg-neutral-800"
            >
              {snippetCopied === client.id ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        </div>
      </details>
    {/each}
  </div>
</section>

<!-- 3. Capabilities -->
<section class="mb-10">
  <h2 class="mb-4 text-lg font-medium">3. Capabilities</h2>
  <div class="grid gap-3 md:grid-cols-2">
    {#each TOOL_CATEGORIES as cat}
      <div
        class="rounded-xl border bg-gradient-to-br p-5 {cat.accent}"
      >
        <div class="mb-3 text-2xl">{cat.emoji}</div>
        <h3 class="text-sm font-semibold lowercase tracking-wide">{cat.name}</h3>
        <p class="mt-1 text-xs text-neutral-400">{cat.blurb}</p>
      </div>
    {/each}
  </div>
</section>

<!-- 4. Available tools -->
<section class="mb-10">
  <div class="mb-4 flex items-center justify-between">
    <h2 class="text-lg font-medium">4. Available tools</h2>
    <span class="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200">
      {TOTAL_TOOLS} tools
    </span>
  </div>
  <div class="space-y-2">
    {#each TOOL_CATEGORIES as cat}
      <details
        class="group rounded-xl border border-white/10 bg-white/[0.02] open:bg-white/[0.04]"
      >
        <summary class="flex cursor-pointer list-none items-center justify-between px-4 py-3">
          <span class="flex items-center gap-3">
            <span class="text-base">{cat.emoji}</span>
            <span class="text-sm font-medium">{cat.name}</span>
            <span class="text-xs text-neutral-500">{cat.tools.length} tools</span>
          </span>
          <span class="text-neutral-500 transition group-open:rotate-180">▾</span>
        </summary>
        <ul class="divide-y divide-white/5 px-4 pb-2">
          {#each cat.tools as tool}
            <li class="py-2.5">
              <p class="font-mono text-xs text-violet-300">{tool.name}</p>
              <p class="mt-0.5 text-xs text-neutral-400">{tool.description}</p>
            </li>
          {/each}
        </ul>
      </details>
    {/each}
  </div>
</section>

<!-- Generate-token dialog. Native <dialog> + showModal(). -->
<dialog
  bind:this={dialog}
  class="m-auto w-full max-w-md rounded-xl border border-white/10 bg-neutral-900 p-6 text-neutral-100 backdrop:bg-black/60"
>
  {#if !generatedToken}
    <h3 class="mb-2 text-lg font-medium">Generate a new token</h3>
    <p class="mb-5 text-sm text-neutral-400">
      Give it a name so you can tell tokens apart in the list.
    </p>

    <form onsubmit={generate}>
      <!-- svelte-ignore a11y_autofocus — modal triggered by user click; focus is expected -->
      <input
        type="text"
        bind:value={newName}
        placeholder="e.g. Claude Desktop"
        maxlength="80"
        autofocus
        required
        class="mb-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm placeholder:text-neutral-600 focus:border-violet-500/50 focus:outline-none"
      />
      {#if errorMsg}
        <p class="mb-3 text-xs text-red-400">{errorMsg}</p>
      {/if}
      <div class="mt-4 flex gap-2">
        <button
          type="button"
          onclick={closeDialog}
          class="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm transition hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={generating || !newName.trim()}
          class="flex-1 rounded-md bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200 disabled:opacity-50"
        >
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </form>
  {:else}
    <h3 class="mb-2 text-lg font-medium">Token created</h3>
    <p class="mb-3 text-sm text-amber-300">
      ⚠ This is the only time you'll see this token. Copy it now and paste into
      your AI assistant's settings. If you lose it, generate a new one.
    </p>

    <label class="mb-1 block text-xs uppercase tracking-wider text-neutral-500" for="token-display">
      {generatedToken.name}
    </label>
    <textarea
      id="token-display"
      readonly
      rows="3"
      class="w-full resize-none rounded-md border border-white/10 bg-black/40 p-3 font-mono text-sm break-all"
      onclick={(e) => (e.currentTarget as HTMLTextAreaElement).select()}>{generatedToken.token}</textarea
    >

    <div class="mt-4 flex gap-2">
      <button
        type="button"
        onclick={copyToken}
        class="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm transition hover:bg-white/10"
      >
        {copyState === 'copied' ? 'Copied ✓' : 'Copy to clipboard'}
      </button>
      <button
        type="button"
        onclick={closeDialog}
        class="flex-1 rounded-md bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200"
      >
        Done
      </button>
    </div>
  {/if}
</dialog>
