<script lang="ts">
  import { invalidateAll } from '$app/navigation';

  let { data } = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  let newName = $state('');
  let generating = $state(false);
  let generatedToken = $state<{ name: string; token: string } | null>(null);
  let copyState = $state<'idle' | 'copied'>('idle');
  let revokingId = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);

  function openGenerate() {
    newName = '';
    generatedToken = null;
    errorMsg = null;
    copyState = 'idle';
    dialog?.showModal();
  }

  function closeDialog() {
    dialog?.close();
    // Fully clear the once-shown token so it can never be re-rendered.
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
      await invalidateAll(); // refresh the token list behind the dialog
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
      <p class="mt-1 text-sm text-neutral-400">₹299/month · GST-inclusive · Cancel anytime</p>
    </div>
    {#if data.subscriptionActive}
      <span
        class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300"
      >
        Active
      </span>
    {:else}
      <span
        class="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300"
      >
        {data.subscriptionStatus ?? 'Not subscribed'}
      </span>
    {/if}
  </div>

  {#if !data.subscriptionActive}
    <button
      class="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200"
      disabled
    >
      Subscribe — coming in Phase 5
    </button>
    <p class="mt-3 text-xs text-neutral-500">
      Razorpay test-mode integration is not wired yet — until then, ask Somu for a dev sub.
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
      onclick={openGenerate}
      disabled={!data.subscriptionActive}
      class="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200 disabled:opacity-50"
    >
      Generate token
    </button>
  </div>

  {#if !data.subscriptionActive}
    <p class="rounded-lg border border-white/5 bg-black/20 px-4 py-3 text-sm text-neutral-500">
      Subscribe first to generate tokens. Tokens are shown once at creation — copy them
      immediately into your AI assistant's settings.
    </p>
  {:else if data.tokens.length === 0}
    <p class="rounded-lg border border-white/5 bg-black/20 px-4 py-3 text-sm text-neutral-500">
      No tokens yet. Generate one to connect Claude Desktop or ChatGPT.
    </p>
  {:else}
    <ul class="divide-y divide-white/5">
      {#each data.tokens as token (token.id)}
        <li class="flex items-center justify-between py-3">
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

<!-- Generate-token dialog. Uses the native <dialog> element + showModal(). -->
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
      <!-- svelte-ignore a11y_autofocus — this is the only field in a modal triggered by a click, so focus is expected -->
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
      ⚠ This is the only time you'll see this token. Copy it now and paste into your AI
      assistant's settings. If you lose it, generate a new one.
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
