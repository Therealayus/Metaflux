"use client";

import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { api, ApiError } from "@/lib/api";

interface Subscription {
  plan: string;
  planName: string;
  status: string;
  entitlements: Record<string, number | boolean | null>;
  usage: { workflows: number; executionsThisMonth: number; apiRequests30d: number; aiSpendCentsMonth: number };
  plans: Array<{ id: string; name: string; monthlyCents: number | null }>;
}

function fmtLimit(v: number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "∞";
  if (typeof v === "boolean") return v ? "yes" : "—";
  return v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);
}

export default function BillingPage() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    try {
      setSub(await api<Subscription>("/api/v1/billing/subscription"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load billing");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function checkout(plan: string) {
    setError(null);
    setNotice(null);
    try {
      const s = await api<{ url: string }>("/api/v1/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      window.location.href = s.url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Checkout failed");
    }
  }

  async function setPlan(plan: string) {
    setError(null);
    setNotice(null);
    try {
      await api("/api/v1/billing/plan", { method: "POST", body: JSON.stringify({ plan }), confirm: true });
      setNotice(`Plan set to ${plan}.`);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Plan change failed");
    }
  }

  return (
    <AppShell>
      <PageHeader title="Billing" body="Usage is metered async across API calls, events, executions and AI tokens." />
      {error ? <p className="mb-4 rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-lg border border-emerald-400/25 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200">{notice}</p> : null}
      {!sub ? (
        <p className="py-8 text-center text-sm text-zinc-500">Loading subscription…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              ["Workflows", `${sub.usage.workflows} / ${fmtLimit(sub.entitlements.maxWorkflows as number)}`],
              ["Executions / mo", `${sub.usage.executionsThisMonth} / ${fmtLimit(sub.entitlements.maxExecutionsPerMonth as number | null)}`],
              ["API calls / 30d", `${sub.usage.apiRequests30d} / ${fmtLimit(sub.entitlements.maxApiRequestsPerMonth as number | null)}`],
              ["AI spend / mo", `$${(sub.usage.aiSpendCentsMonth / 100).toFixed(2)} / $${((sub.entitlements.maxAiSpendCentsPerMonth as number) / 100).toFixed(0)}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-xs text-zinc-500">{k}</p>
                <p className="mt-1 text-xl font-semibold text-white">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-sm text-zinc-400">Current plan: <span className="font-medium text-white">{sub.planName}</span> <span className="text-xs text-zinc-500">({sub.status})</span></p>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {sub.plans.map((p) => (
                <div key={p.id} className={`rounded-xl border p-4 ${p.id === sub.plan ? "border-indigo-400/50 bg-indigo-500/10" : "border-white/10"}`}>
                  <p className="text-sm font-medium text-white">{p.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{p.monthlyCents === null ? "Custom" : p.monthlyCents === 0 ? "Free" : `$${(p.monthlyCents / 100).toFixed(0)}/mo`}</p>
                  <div className="mt-3 flex gap-2">
                    {p.id !== sub.plan && p.monthlyCents !== null && p.monthlyCents > 0 ? (
                      <button onClick={() => void checkout(p.id)} className="h-8 flex-1 rounded-lg bg-indigo-500 text-xs font-medium text-white hover:bg-indigo-400">Upgrade</button>
                    ) : null}
                    {p.id !== sub.plan ? (
                      <button onClick={() => void setPlan(p.id)} title="Self-hosted plan override (owner only)" className="h-8 flex-1 rounded-lg border border-white/10 text-xs text-zinc-300 hover:bg-white/5">Set plan</button>
                    ) : (
                      <span className="text-xs text-indigo-300">Current</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-zinc-600">“Set plan” is the self-hosted override (owner only, audited). “Upgrade” opens Stripe Checkout when billing is configured.</p>
          </div>
        </>
      )}
    </AppShell>
  );
}
