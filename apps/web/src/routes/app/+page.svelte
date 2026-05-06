<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { MCP_CLIENTS } from '$lib/mcp-clients';
  import { TOOL_CATEGORIES, TOTAL_TOOLS } from '$lib/tool-catalog';

  let { data } = $props();

  // Session-only token used for one-time display and snippet prefill.
  let liveToken = $state<string | null>(null);
  let liveTokenId = $state<string | null>(null);
  let liveTokenName = $state<string | null>(null);

  type Mode = 'idle' | 'naming' | 'generated';
  let mode = $state<Mode>('idle');
  let newName = $state('');
  let generating = $state(false);
  let errorMsg = $state<string | null>(null);
  let tokenCopied = $state(false);

  let revokingId = $state<string | null>(null);
  let subscribing = $state(false);
  let subscribeError = $state<string | null>(null);
  let snippetCopied = $state<string | null>(null);

  type RazorpayCheckout = {
    open: () => void;
  };

  type RazorpayResponse = {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };

  type RazorpayOptions = {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    order_id: string;
    handler: (response: RazorpayResponse) => void | Promise<void>;
    theme: { color: string };
    modal: { ondismiss: () => void };
  };

  type RazorpayWindow = Window &
    typeof globalThis & {
      Razorpay?: new (options: RazorpayOptions) => RazorpayCheckout;
    };

  function snippetWithToken(snippet: string): string {
    return liveToken ? snippet.replaceAll('YOUR_TOKEN_HERE', liveToken) : snippet;
  }

  async function loadRazorpay(): Promise<void> {
    if ((window as RazorpayWindow).Razorpay) return;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Unable to load Razorpay Checkout'));
      document.head.appendChild(script);
    });
  }

  async function subscribe() {
    subscribing = true;
    subscribeError = null;
    try {
      const res = await fetch('/api/subscription/create-order', { method: 'POST' });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Failed (${res.status})`);
      }
      const order = (await res.json()) as {
        key_id: string;
        order_id: string;
        amount: number;
        currency: string;
        name: string;
        description: string;
      };
      await loadRazorpay();
      const Razorpay = (window as RazorpayWindow).Razorpay;
      if (!Razorpay) throw new Error('Razorpay Checkout unavailable');

      const checkout = new Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        order_id: order.order_id,
        theme: { color: '#ffffff' },
        modal: {
          ondismiss: () => {
            subscribing = false;
          },
        },
        handler: async (response) => {
          try {
            const verifyRes = await fetch('/api/subscription/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(response),
            });
            if (!verifyRes.ok) {
              const err = (await verifyRes.json()) as { error?: string };
              throw new Error(err.error ?? `Failed (${verifyRes.status})`);
            }
            await invalidateAll();
          } catch (err) {
            subscribeError = err instanceof Error ? err.message : 'Failed to verify payment';
          } finally {
            subscribing = false;
          }
        },
      });
      checkout.open();
    } catch (err) {
      subscribeError = err instanceof Error ? err.message : 'Failed to subscribe';
      subscribing = false;
    }
  }

  function startNaming() {
    if (!data.subscriptionActive) return;
    mode = 'naming';
    newName = '';
    errorMsg = null;
  }

  function cancelNaming() {
    mode = 'idle';
    newName = '';
    errorMsg = null;
  }

  function dismissGenerated() {
    mode = 'idle';
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
      const body = (await res.json()) as { id: string; name: string; token: string };
      liveToken = body.token;
      liveTokenId = body.id;
      liveTokenName = body.name;
      mode = 'generated';
      tokenCopied = false;
      await invalidateAll();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Failed to generate token';
    } finally {
      generating = false;
    }
  }

  async function copyLiveToken() {
    if (!liveToken) return;
    try {
      await navigator.clipboard.writeText(liveToken);
      tokenCopied = true;
      setTimeout(() => (tokenCopied = false), 1800);
    } catch {
      // ignore — user can still select-all in the textarea
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
      if (id === liveTokenId) {
        liveToken = null;
        liveTokenId = null;
        liveTokenName = null;
        if (mode === 'generated') mode = 'idle';
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
      ₹299/month — paid securely with Razorpay test checkout.
    </p>
    <button
      onclick={subscribe}
      disabled={subscribing}
      class="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200 disabled:opacity-60"
    >
      {subscribing ? 'Opening Razorpay…' : 'Subscribe with Razorpay'}
    </button>
    {#if subscribeError}
      <p class="mt-3 text-xs text-red-400">{subscribeError}</p>
    {/if}
  </section>
{/if}

<!-- 1. Generate your token -->
<section class="mb-10">
  <h2 class="mb-4 text-lg font-medium">1. Generate your token</h2>

  {#if mode === 'idle'}
    <button
      onclick={startNaming}
      disabled={!data.subscriptionActive}
      class="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] py-4 text-sm font-medium transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span aria-hidden="true">🔑</span>
      Generate Token
    </button>
  {:else if mode === 'naming'}
    <form
      onsubmit={generate}
      class="rounded-xl border border-white/10 bg-white/[0.02] p-4"
    >
      <label class="mb-2 block text-xs uppercase tracking-wider text-neutral-500" for="token-name">
        Name this token
      </label>
      <!-- svelte-ignore a11y_autofocus — form revealed by user click; focus expected -->
      <input
        id="token-name"
        type="text"
        bind:value={newName}
        placeholder="e.g. Claude Desktop"
        maxlength="80"
        autofocus
        required
        class="mb-3 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm placeholder:text-neutral-600 focus:border-violet-500/50 focus:outline-none"
      />
      {#if errorMsg}
        <p class="mb-3 text-xs text-red-400">{errorMsg}</p>
      {/if}
      <div class="flex gap-2">
        <button
          type="button"
          onclick={cancelNaming}
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
  {:else if liveToken && liveTokenName}
    <div class="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-5">
      <div class="mb-3 flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-medium">Token created · {liveTokenName}</p>
          <p class="mt-1 text-xs text-amber-300">
            ⚠ This is the only time we'll show it. Snippets in step 2 are
            already pre-filled with this token until you refresh.
          </p>
        </div>
        <button
          type="button"
          onclick={dismissGenerated}
          aria-label="Dismiss"
          class="text-neutral-500 transition hover:text-neutral-300"
        >
          ✕
        </button>
      </div>
      <textarea
        readonly
        rows="3"
        class="w-full resize-none rounded-md border border-white/10 bg-black/40 p-3 font-mono text-xs break-all"
        onclick={(e) => (e.currentTarget as HTMLTextAreaElement).select()}>{liveToken}</textarea
      >
      <div class="mt-3 flex gap-2">
        <button
          type="button"
          onclick={copyLiveToken}
          class="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm transition hover:bg-white/10"
        >
          {tokenCopied ? 'Copied ✓' : 'Copy token'}
        </button>
        <button
          type="button"
          onclick={startNaming}
          class="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm transition hover:bg-white/10"
        >
          Generate another
        </button>
      </div>
    </div>
  {/if}

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
              <p class="text-sm font-medium">
                {token.name}
                {#if token.id === liveTokenId}
                  <span class="ml-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-normal text-emerald-300">
                    just created
                  </span>
                {/if}
              </p>
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
  <div class="mb-4 flex items-center justify-between">
    <h2 class="text-lg font-medium">2. Add to your MCP client</h2>
    {#if liveToken}
      <span class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
        snippets pre-filled with your new token
      </span>
    {/if}
  </div>
  <div class="space-y-2">
    {#each MCP_CLIENTS as client}
      {@const filled = snippetWithToken(client.snippet)}
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
<code>{filled}</code></pre>
            <button
              onclick={() => copySnippet(client.id, filled)}
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
      <div class="rounded-xl border bg-gradient-to-br p-5 {cat.accent}">
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
