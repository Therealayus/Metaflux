import Link from "next/link";
import {
  Activity,
  Braces,
  GitBranch,
  HeartPulse,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";
import { CommandDemo } from "@/components/command-demo";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

const PILLARS = [
  { icon: Sparkles, title: "AI API planning", body: "Describe the outcome. MetaFlux derives capabilities, permissions, assets and a validated execution plan." },
  { icon: KeyRound, title: "Permission intelligence", body: "Every permission explained in plain language — why it's needed, what breaks without it, and whether Meta must approve it." },
  { icon: Webhook, title: "Webhook infrastructure", body: "Verified, deduplicated, queued and replayable event ingestion. Burst-safe by design." },
  { icon: Workflow, title: "Workflow automation", body: "A visual builder over a durable async engine. The frontend never executes business logic." },
  { icon: HeartPulse, title: "Health monitoring", body: "Tokens, permissions, webhooks, API errors and rate limits — one honest status per connection." },
  { icon: Braces, title: "Developer platform", body: "Versioned APIs, keys, request inspector, test events and replay. Typed DTOs and OpenAPI from day one." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-ink-950">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden pt-32 sm:pt-40">
          <div className="bg-grid absolute inset-0" aria-hidden />
          <div className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(99,102,241,0.16),transparent)]" aria-hidden />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                AI-native Meta integration platform
              </p>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl">
                Your business speaks naturally. <span className="text-indigo-300">MetaFlux speaks Meta APIs.</span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-zinc-400 sm:text-base">
                Connect WhatsApp, Instagram and Facebook. Describe what you want to automate.
                MetaFlux handles the APIs, permissions, webhooks and infrastructure.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="inline-flex h-11 items-center rounded-lg bg-indigo-500 px-5 text-sm font-medium text-white hover:bg-indigo-400">
                  Start building free
                </Link>
                <Link href="/home" className="inline-flex h-11 items-center rounded-lg border border-white/12 bg-white/[0.03] px-5 text-sm font-medium text-zinc-100 hover:bg-white/[0.07]">
                  Explore the platform
                </Link>
              </div>
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-white/[0.07] pt-6">
                {[
                  ["3", "Meta products"],
                  ["500k+", "users target"],
                  ["99.9%", "event capture goal"],
                ].map(([v, l]) => (
                  <div key={l}>
                    <dt className="text-xl font-semibold text-white">{v}</dt>
                    <dd className="mt-1 text-xs text-zinc-500">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <CommandDemo />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-7xl px-5 py-20">
            <p className="text-xs font-medium uppercase tracking-widest text-indigo-300">How MetaFlux works</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-white">Complicated Meta workflows, reduced to a sentence.</h2>
            <ol className="mt-10 grid gap-4 md:grid-cols-4">
              {[
                ["01", "Describe the outcome", "“When someone asks about pricing, reply and create a lead.”"],
                ["02", "AI plans the integration", "Capabilities, permissions, assets and missing requirements — validated, never guessed."],
                ["03", "Approve & connect", "Guided OAuth, asset discovery and webhook setup. Destructive actions always confirm."],
                ["04", "MetaFlux operates it", "Execution, retries, error diagnosis and health monitoring run continuously."],
              ].map(([n, t, b]) => (
                <li key={n} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                  <p className="font-mono text-xs text-indigo-300">{n}</p>
                  <p className="mt-2 text-sm font-medium text-white">{t}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{b}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pillars */}
        <section id="integrations" className="border-t border-white/[0.06] bg-white/[0.01]">
          <div className="mx-auto max-w-7xl px-5 py-20">
            <p className="text-xs font-medium uppercase tracking-widest text-indigo-300">Platform</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">An operating layer for Meta — not another wrapper.</h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PILLARS.map((p) => (
                <div key={p.title} className="rounded-2xl border border-white/[0.08] bg-ink-900/60 p-5">
                  <p.icon className="h-5 w-5 text-indigo-300" />
                  <p className="mt-3 text-sm font-medium text-white">{p.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Troubleshooting + health */}
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto grid max-w-7xl gap-4 px-5 py-20 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-ink-900/60 p-6">
              <Zap className="h-5 w-5 text-amber-300" />
              <h3 className="mt-3 text-lg font-semibold text-white">“Why did my automation stop?” — answered with evidence.</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                The troubleshooter inspects connection, token, permissions, webhooks, recent errors, rate limits and
                executions — then reports confirmed vs. probable causes with a fix action. Never fabricated.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-ink-900/60 p-6">
              <Activity className="h-5 w-5 text-emerald-300" />
              <h3 className="mt-3 text-lg font-semibold text-white">Integration health you can trust.</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Token, permissions, webhooks, API and last-event status per connection. If Meta approval blocks a
                capability, MetaFlux says so — it never pretends to bypass Meta restrictions.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-ink-900/60 p-6">
              <GitBranch className="h-5 w-5 text-indigo-300" />
              <h3 className="mt-3 text-lg font-semibold text-white">Visual workflows over a durable engine.</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Triggers, conditions, AI steps, messaging, delays and branches — executed asynchronously with retries,
                idempotency and full history.
              </p>
            </div>
            <div id="developers" className="rounded-2xl border border-white/[0.08] bg-ink-900/60 p-6">
              <ShieldCheck className="h-5 w-5 text-sky-300" />
              <h3 className="mt-3 text-lg font-semibold text-white">Enterprise-grade from day one.</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Tenant isolation, encrypted tokens, RBAC, audit logs, rate limiting, versioned APIs and a provider
                abstraction that keeps Meta details out of your business logic.
              </p>
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="border-t border-white/[0.06] bg-white/[0.01]">
          <div className="mx-auto max-w-7xl px-5 py-20">
            <h2 className="text-3xl font-semibold tracking-tight text-white">Security is the product.</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                ["Encrypted tokens", "OAuth tokens encrypted at rest (AES-256-GCM). API keys stored as hashes. Secrets never reach the frontend or logs."],
                ["Untrusted AI, by design", "LLM output is validated, permission-checked and policy-gated. Destructive actions require explicit confirmation."],
                ["Tenant isolation", "Every query scoped by server-derived session context. Admin actions audited. Abuse and rate limits enforced per layer."],
              ].map(([t, b]) => (
                <div key={t} className="rounded-2xl border border-white/[0.08] bg-ink-900/60 p-5">
                  <p className="text-sm font-medium text-white">{t}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-7xl px-5 py-20">
            <h2 className="text-3xl font-semibold tracking-tight text-white">Pricing that scales with automation.</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {[
                ["Free", "$0", "1 workspace · 3 workflows · limited AI"],
                ["Starter", "$29", "More workflows · automation · basic analytics"],
                ["Growth", "$99", "Advanced AI · team · developer APIs"],
                ["Enterprise", "Custom", "SSO · audit · SLA · dedicated options"],
              ].map(([t, p, b]) => (
                <div key={t} className="rounded-2xl border border-white/[0.08] bg-ink-900/60 p-5">
                  <p className="text-sm font-medium text-white">{t}</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{p}</p>
                  <p className="mt-2 text-sm text-zinc-400">{b}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-zinc-500">Plan limits enforced through an entitlement system — never hard-coded into business logic.</p>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-7xl px-5 py-20 text-center">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white">Meta is complicated. MetaFlux isn&apos;t.</h2>
            <div className="mt-8 flex justify-center gap-3">
              <Link href="/signup" className="inline-flex h-11 items-center rounded-lg bg-indigo-500 px-5 text-sm font-medium text-white hover:bg-indigo-400">
                Start building free
              </Link>
              <Link href="/home" className="inline-flex h-11 items-center rounded-lg border border-white/12 bg-white/[0.03] px-5 text-sm text-zinc-100 hover:bg-white/[0.07]">
                Explore the platform
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
