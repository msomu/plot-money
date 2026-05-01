<script lang="ts">
  import { signInWithGoogle } from '$lib/auth-client';

  let signingIn = $state(false);

  async function handleSignIn() {
    signingIn = true;
    try {
      await signInWithGoogle('/app');
    } catch (err) {
      console.error('sign-in failed', err);
      signingIn = false;
    }
  }

  const examplePrompts = [
    'Add a transaction of ₹450 for groceries today from my HDFC savings',
    'What did I spend on food this month?',
    "Show me my net worth across all accounts",
    'List all transactions over ₹5000 in April',
    'How much did I invest in SIPs last quarter?',
    "What's my biggest spending category this year?",
  ];

  const faqs = [
    {
      q: 'Where is my data stored?',
      a: "Encrypted at rest in Postgres on Neon (Mumbai region). We never share, sell, or train AI on your financial data. You can self-host the entire stack — see the GitHub repo.",
    },
    {
      q: 'Which AI assistants does this work with?',
      a: 'Anything that speaks the Model Context Protocol — Claude Desktop, ChatGPT (custom connectors), Cursor, Cline, Continue, and many more. Setup docs for Claude and ChatGPT are linked from your dashboard.',
    },
    {
      q: 'Can I self-host this?',
      a: "Yes. The entire codebase is open source under the MIT license. You'll need a Postgres database, a Google OAuth client, and a hosting provider for Bun. See the docs in the repo.",
    },
    {
      q: 'What happens if I cancel?',
      a: "Your data stays accessible for 30 days, then we delete it. You can export everything as JSON or CSV from the dashboard before that. No lock-in.",
    },
    {
      q: 'Do I get a GST invoice?',
      a: "Yes — Razorpay generates a GSTIN-compliant invoice for every billing cycle. It's emailed to you automatically and downloadable from the dashboard.",
    },
    {
      q: 'Is bank auto-sync supported?',
      a: "Not in v0.1. We're keeping the manual-entry flow tight first. Account Aggregator integration is on the roadmap once we've validated the chat-first model.",
    },
  ];
</script>

<svelte:head>
  <title>plot.money — manage money via Claude or ChatGPT</title>
</svelte:head>

<!-- Header -->
<header class="border-b border-white/5">
  <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
    <a href="/" class="font-semibold tracking-tight">plot<span class="text-violet-400">.</span>money</a>
    <nav class="flex items-center gap-6 text-sm text-neutral-400">
      <a href="#how" class="transition hover:text-white">How it works</a>
      <a href="#pricing" class="transition hover:text-white">Pricing</a>
      <a href="#faq" class="transition hover:text-white">FAQ</a>
      <a
        href="https://github.com/msomu/plot-money"
        class="transition hover:text-white"
        target="_blank"
        rel="noreferrer">GitHub</a
      >
      <button
        onclick={handleSignIn}
        disabled={signingIn}
        class="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200 disabled:opacity-60"
      >
        {signingIn ? 'Redirecting…' : 'Sign in'}
      </button>
    </nav>
  </div>
</header>

<!-- Hero -->
<section class="mx-auto max-w-6xl px-6 pt-24 pb-20 text-center">
  <div class="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300">
    <span class="size-1.5 rounded-full bg-emerald-400"></span>
    Open source · MCP-first · Built for India
  </div>
  <h1 class="gradient-text mx-auto max-w-3xl text-5xl font-semibold tracking-tight md:text-6xl">
    Manage your money through Claude or ChatGPT.
  </h1>
  <p class="mx-auto mt-6 max-w-xl text-lg text-neutral-400">
    No app to install. No dashboard to learn. Connect plot.money to your AI assistant
    and just ask: <em class="text-neutral-200">"what did I spend on food this month?"</em>
  </p>
  <div class="mt-10 flex items-center justify-center gap-3">
    <button
      onclick={handleSignIn}
      disabled={signingIn}
      class="rounded-lg bg-white px-5 py-3 font-medium text-neutral-900 transition hover:bg-neutral-200 disabled:opacity-60"
    >
      {signingIn ? 'Redirecting…' : 'Get started — ₹299/mo'}
    </button>
    <a
      href="#how"
      class="rounded-lg border border-white/10 bg-white/5 px-5 py-3 font-medium text-neutral-200 transition hover:border-white/20 hover:bg-white/10"
    >
      How it works
    </a>
  </div>
</section>

<!-- How it works -->
<section id="how" class="mx-auto max-w-6xl px-6 py-20">
  <h2 class="mb-12 text-center text-3xl font-semibold tracking-tight">Three steps to your money in chat</h2>
  <div class="grid gap-6 md:grid-cols-3">
    {#each [
      { n: '1', title: 'Sign in with Google', body: 'No password to remember. We use Better Auth for secure session management.' },
      { n: '2', title: 'Subscribe & generate a token', body: 'One token per AI assistant. Show only once at creation; revoke any time.' },
      { n: '3', title: 'Connect your AI assistant', body: 'Paste the URL and token into Claude Desktop, ChatGPT, Cursor — anything MCP.' },
    ] as step}
      <div class="rounded-xl border border-white/10 bg-white/[0.02] p-6">
        <div class="mb-4 inline-flex size-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300 font-mono">
          {step.n}
        </div>
        <h3 class="mb-2 text-lg font-medium">{step.title}</h3>
        <p class="text-sm text-neutral-400">{step.body}</p>
      </div>
    {/each}
  </div>
</section>

<!-- Why MCP -->
<section class="mx-auto max-w-6xl px-6 py-20">
  <div class="rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/5 to-pink-500/5 p-10">
    <p class="mb-3 text-sm uppercase tracking-wider text-violet-300/80">Why MCP</p>
    <h2 class="mb-4 max-w-2xl text-3xl font-semibold tracking-tight">
      Your AI assistant becomes the interface, not another app.
    </h2>
    <p class="max-w-2xl text-neutral-400">
      Existing finance apps make you tap through menus. Open-source budgeting tools
      were built for US/EU banking. plot.money is the first personal finance backend
      designed for AI agents — INR-first, GST-aware, UPI/SIP/MF categories baked in.
      With the Model Context Protocol becoming the standard, "ask Claude what I spent"
      should just work. Now it does.
    </p>
  </div>
</section>

<!-- What you can do -->
<section class="mx-auto max-w-6xl px-6 py-20">
  <h2 class="mb-3 text-center text-3xl font-semibold tracking-tight">What you can ask</h2>
  <p class="mx-auto mb-12 max-w-xl text-center text-neutral-400">
    Anything you'd normally do in a finance app — except faster, in plain English.
  </p>
  <div class="grid gap-3 md:grid-cols-2">
    {#each examplePrompts as prompt}
      <div class="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-neutral-300">
        <span class="mr-2 text-violet-400">›</span>{prompt}
      </div>
    {/each}
  </div>
</section>

<!-- Pricing -->
<section id="pricing" class="mx-auto max-w-6xl px-6 py-20">
  <h2 class="mb-12 text-center text-3xl font-semibold tracking-tight">Simple, single tier</h2>
  <div class="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8">
    <p class="mb-2 text-sm uppercase tracking-wider text-neutral-400">Pro</p>
    <p class="mb-1">
      <span class="text-5xl font-semibold tracking-tight">₹299</span>
      <span class="text-neutral-400">/month</span>
    </p>
    <p class="mb-8 text-sm text-neutral-500">GST-inclusive. Cancel anytime.</p>
    <ul class="mb-8 space-y-3 text-sm text-neutral-300">
      {#each [
        'Unlimited transactions, accounts, MCP tokens',
        'Works with Claude, ChatGPT, Cursor, every MCP host',
        'Net worth, cash flow, category breakdowns — instant',
        'Open source — audit or self-host whenever you want',
        'GST invoice for every billing cycle',
      ] as f}
        <li class="flex items-start gap-2">
          <span class="mt-0.5 text-emerald-400">✓</span>
          <span>{f}</span>
        </li>
      {/each}
    </ul>
    <button
      onclick={handleSignIn}
      disabled={signingIn}
      class="w-full rounded-lg bg-white py-3 font-medium text-neutral-900 transition hover:bg-neutral-200 disabled:opacity-60"
    >
      {signingIn ? 'Redirecting…' : 'Subscribe'}
    </button>
  </div>
</section>

<!-- FAQ -->
<section id="faq" class="mx-auto max-w-6xl px-6 py-20">
  <h2 class="mb-12 text-center text-3xl font-semibold tracking-tight">Frequently asked</h2>
  <div class="mx-auto max-w-3xl divide-y divide-white/5">
    {#each faqs as f}
      <details class="group py-5">
        <summary class="flex cursor-pointer list-none items-center justify-between text-base font-medium">
          {f.q}
          <span class="text-neutral-500 transition group-open:rotate-45">+</span>
        </summary>
        <p class="mt-3 text-sm text-neutral-400">{f.a}</p>
      </details>
    {/each}
  </div>
</section>

<!-- Footer -->
<footer class="mt-20 border-t border-white/5">
  <div class="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-10 md:flex-row md:items-center">
    <div>
      <p class="font-semibold">plot<span class="text-violet-400">.</span>money</p>
      <p class="mt-1 text-xs text-neutral-500">Built in Bangalore · Open source under MIT</p>
    </div>
    <div class="flex gap-6 text-sm text-neutral-400">
      <a href="https://github.com/msomu/plot-money" target="_blank" rel="noreferrer" class="hover:text-white">GitHub</a>
      <a href="/privacy" class="hover:text-white">Privacy</a>
      <a href="/terms" class="hover:text-white">Terms</a>
      <a href="mailto:msomasundaram93@gmail.com" class="hover:text-white">Contact</a>
    </div>
  </div>
</footer>
