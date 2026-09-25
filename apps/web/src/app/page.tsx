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
import { Reveal } from "@/components/reveal";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

const PILLARS = [
  { icon: Sparkles, title: "AI API planning", body: "Describe the outcome. SocialFlux derives capabilities, permissions, assets and a validated execution plan." },
  { icon: KeyRound, title: "Permission intelligence", body: "Every permission explained in plain language — why it's needed, what breaks without it, and whether Meta must approve it." },
  { icon: Webhook, title: "Webhook infrastructure", body: "Verified, deduplicated, queued and replayable event ingestion. Burst-safe by design." },
  { icon: Workflow, title: "Workflow automation", body: "A visual builder over a durable async engine. The frontend never executes business logic." },
  { icon: HeartPulse, title: "Health monitoring", body: "Tokens, permissions, webhooks, API errors and rate limits — one honest status per connection." },
  { icon: Braces, title: "Developer platform", body: "Versioned APIs, keys, request inspector, test events and replay. Typed DTOs and OpenAPI from day one." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-ink-950 light:bg-[#ECEEF7]">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden pt-32 sm:pt-40">
          <div className="bg-grid absolute inset-0" aria-hidden />
          <div className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(99,102,241,0.16),transparent)]" aria-hidden />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-zinc-300 light:border-indigo-950/15 light:bg-white light:text-zinc-600 light:shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                AI-native Meta integration platform
              </p>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-white light:text-zinc-900 sm:text-6xl">
                Your business speaks naturally. <span className="text-indigo-300 light:text-indigo-600">SocialFlux speaks Meta APIs.</span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-zinc-400 light:text-zinc-600 sm:text-base">
                Connect WhatsApp, Instagram and Facebook. Describe what you want to automate.
                SocialFlux handles the APIs, permissions, webhooks and infrastructure.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="inline-flex h-11 items-center rounded-lg bg-indigo-500 px-5 text-sm font-medium text-white hover:bg-indigo-400">
                  Start building free
                </Link>
                <Link href="/home" className="inline-flex h-11 items-center rounded-lg border border-white/12 bg-white/[0.03] px-5 text-sm font-medium text-zinc-100 hover:bg-white/[0.07] light:border-indigo-950/15 light:bg-white light:text-zinc-800 light:shadow-sm light:hover:bg-zinc-50">
                  Explore the platform
                </Link>
              </div>
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-white/[0.07] pt-6 light:border-indigo-950/10">
                {[
                  ["3", "Meta products"],
                  ["500k+", "users target"],
                  ["99.9%", "event capture goal"],
                ].map(([v, l]) => (
                  <div key={l}>
                    <dt className="text-xl font-semibold text-white light:text-zinc-900">{v}</dt>
                    <dd className="mt-1 text-xs text-zinc-500">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <CommandDemo />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-white/[0.06] light:border-indigo-950/10">
          <div className="mx-auto max-w-7xl px-5 py-20">
            <Reveal>
              <p className="text-xs font-medium uppercase tracking-widest text-indigo-300 light:text-indigo-600">How SocialFlux works</p>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-white light:text-zinc-900">Complicated Meta workflows, reduced to a sentence.</h2>
            </Reveal>
            <Reveal delay={0.08}>
            <ol className="mt-10 grid gap-4 md:grid-cols-4">
              {[
                ["01", "Describe the outcome", "“When someone asks about pricing, reply and create a lead.”"],
                ["02", "AI plans the integration", "Capabilities, permissions, assets and missing requirements — validated, never guessed."],
                ["03", "Approve & connect", "Guided OAuth, asset discovery and webhook setup. Destructive actions always confirm."],
                ["04", "SocialFlux operates it", "Execution, retries, error diagnosis and health monitoring run continuously."],
              ].map(([n, t, b]) => (
                <li key={n} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 light:border-indigo-950/10 light:bg-white light:shadow-[0_10px_40px_-16px_rgba(79,70,229,0.18)]">
                  <p className="font-mono text-xs text-indigo-300 light:text-indigo-600">{n}</p>
                  <p className="mt-2 text-sm font-medium text-white light:text-zinc-900">{t}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-400 light:text-zinc-600">{b}</p>
                </li>
              ))}
            </ol>
            </Reveal>
          </div>
        </section>

        {/* Pillars */}
        <section id="integrations" className="border-t border-white/[0.06] light:border-indigo-950/10 bg-white/[0.01] light:bg-indigo-950/[0.02]">
          <div className="mx-auto max-w-7xl px-5 py-20">
            <Reveal>
              <p className="text-xs font-medium uppercase tracking-widest text-indigo-300 light:text-indigo-600">Platform</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white light:text-zinc-900">An operating layer for Meta — not another wrapper.</h2>
            </Reveal>
            <Reveal delay={0.08}>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PILLARS.map((p) => (
                <div key={p.title} className="rounded-2xl border border-white/[0.08] bg-ink-900/60 p-5 light:border-indigo-950/10 light:bg-white light:shadow-[0_10px_40px_-16px_rgba(79,70,229,0.18)]">
                  <p.icon className="h-5 w-5 text-indigo-300 light:text-indigo-600" />
                  <p className="mt-3 text-sm font-medium text-white light:text-zinc-900">{p.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-400 light:text-zinc-600">{p.body}</p>
                </div>
              ))}
            </div>
            </Reveal>
          </div>
        </section>

        {/* Troubleshooting + health */}
        <section className="border-t border-white/[0.06] light:border-indigo-950/10">
          <Reveal delay={0.05}>
          <div className="mx-auto grid max-w-7xl gap-4 px-5 py-20 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-ink-900/60 p-6 light:border-indigo-950/10 light:bg-white light:shadow-[0_10px_40px_-16px_rgba(79,70,229,0.18)]">
              <Zap className="h-5 w-5 text-amber-300 light:text-amber-500" />
              <h3 className="mt-3 text-lg font-semibold text-white light:text-zinc-900">“Why did my automation stop?” — answered with evidence.</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400 light:text-zinc-600">
                The troubleshooter inspects connection, token, permissions, webhooks, recent errors, rate limits and
                executions — then reports confirmed vs. probable causes with a fix action. Never fabricated.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-ink-900/60 p-6 light:border-indigo-950/10 light:bg-white light:shadow-[0_10px_40px_-16px_rgba(79,70,229,0.18)]">
              <Activity className="h-5 w-5 text-emerald-300 light:text-emerald-600" />
              <h3 className="mt-3 text-lg font-semibold text-white light:text-zinc-900">Integration health you can trust.</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400 light:text-zinc-600">
                Token, permissions, webhooks, API and last-event status per connection. If Meta approval blocks a
                capability, SocialFlux says so — it never pretends to bypass Meta restrictions.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-ink-900/60 p-6 light:border-indigo-950/10 light:bg-white light:shadow-[0_10px_40px_-16px_rgba(79,70,229,0.18)]">
              <GitBranch className="h-5 w-5 text-indigo-300 light:text-indigo-600" />
              <h3 className="mt-3 text-lg font-semibold text-white light:text-zinc-900">Visual workflows over a durable engine.</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400 light:text-zinc-600">
                Triggers, conditions, AI steps, messaging, delays and branches — executed asynchronously with retries,
                idempotency and full history.
              </p>
            </div>
            <div id="developers" className="rounded-2xl border border-white/[0.08] bg-ink-900/60 p-6 light:border-indigo-950/10 light:bg-white light:shadow-[0_10px_40px_-16px_rgba(79,70,229,0.18)]">
              <ShieldCheck className="h-5 w-5 text-sky-300 light:text-sky-600" />
              <h3 className="mt-3 text-lg font-semibold text-white light:text-zinc-900">Enterprise-grade from day one.</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400 light:text-zinc-600">
                Tenant isolation, encrypted tokens, RBAC, audit logs, rate limiting, versioned APIs and a provider
                abstraction that keeps Meta details out of your business logic.
              </p>
            </div>
          </div>
          </Reveal>
        </section>

        {/* Security */}
        <section id="security" className="border-t border-white/[0.06] light:border-indigo-950/10 bg-white/[0.01] light:bg-indigo-950/[0.02]">
          <div className="mx-auto max-w-7xl px-5 py-20">
            <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight text-white light:text-zinc-900">Security is the product.</h2>
            </Reveal>
            <Reveal delay={0.08}>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                ["Encrypted tokens", "OAuth tokens encrypted at rest (AES-256-GCM). API keys stored as hashes. Secrets never reach the frontend or logs."],
                ["Untrusted AI, by design", "LLM output is validated, permission-checked and policy-gated. Destructive actions require explicit confirmation."],
                ["Tenant isolation", "Every query scoped by server-derived session context. Admin actions audited. Abuse and rate limits enforced per layer."],
              ].map(([t, b]) => (
                <div key={t} className="rounded-2xl border border-white/[0.08] bg-ink-900/60 p-5 light:border-indigo-950/10 light:bg-white light:shadow-[0_10px_40px_-16px_rgba(79,70,229,0.18)]">
                  <p className="text-sm font-medium text-white light:text-zinc-900">{t}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-400 light:text-zinc-600">{b}</p>
                </div>
              ))}
            </div>
            </Reveal>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-white/[0.06] light:border-indigo-950/10">
          <div className="mx-auto max-w-7xl px-5 py-20">
            <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight text-white light:text-zinc-900">Pricing that scales with automation.</h2>
            </Reveal>
            <Reveal delay={0.08}>
            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {[
                ["Free", "$0", "1 workspace · 3 workflows · limited AI"],
                ["Starter", "$29", "More workflows · automation · basic analytics"],
                ["Growth", "$99", "Advanced AI · team · developer APIs"],
                ["Enterprise", "Custom", "SSO · audit · SLA · dedicated options"],
              ].map(([t, p, b]) => (
                <div key={t} className="rounded-2xl border border-white/[0.08] bg-ink-900/60 p-5 light:border-indigo-950/10 light:bg-white light:shadow-[0_10px_40px_-16px_rgba(79,70,229,0.18)]">
                  <p className="text-sm font-medium text-white light:text-zinc-900">{t}</p>
                  <p className="mt-1 text-2xl font-semibold text-white light:text-zinc-900">{p}</p>
                  <p className="mt-2 text-sm text-zinc-400 light:text-zinc-600">{b}</p>
                </div>
              ))}
            </div>
            </Reveal>
            <p className="mt-4 text-xs text-zinc-500">Plan limits enforced through an entitlement system — never hard-coded into business logic.</p>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/[0.06] light:border-indigo-950/10">
          <Reveal>
          <div className="mx-auto max-w-7xl px-5 py-20 text-center">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white light:text-zinc-900">Meta is complicated. SocialFlux isn&apos;t.</h2>
            <div className="mt-8 flex justify-center gap-3">
              <Link href="/signup" className="inline-flex h-11 items-center rounded-lg bg-indigo-500 px-5 text-sm font-medium text-white light:text-zinc-900 hover:bg-indigo-400">
                Start building free
              </Link>
              <Link href="/home" className="inline-flex h-11 items-center rounded-lg border border-white/12 bg-white/[0.03] px-5 text-sm text-zinc-100 hover:bg-white/[0.07] light:border-indigo-950/15 light:bg-white light:text-zinc-800 light:shadow-sm light:hover:bg-zinc-50">
                Explore the platform
              </Link>
            </div>
          </div>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
