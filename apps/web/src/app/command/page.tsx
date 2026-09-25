"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/components/toaster";
import { useSession } from "@/lib/use-session";

interface Plan {
  intent: string;
  summary: string;
  steps: Array<{ provider: string; action: string; label?: string }>;
  requiredCapabilities: Array<{ product: string; capability: string }>;
  requiredPermissions: string[];
  requiredAssets: string[];
  missingRequirements: string[];
  confidence: number;
  needsConfirmation: boolean;
  source: "llm" | "fallback" | "cache";
}

const EVENT_BY_CAPABILITY: Record<string, string> = {
  comments: "comment.created",
  messaging: "message.received",
  insights: "insight.updated",
};

/** Convert a validated plan into a starter workflow definition for the builder. */
function planToDefinition(plan: Plan) {
  const first = plan.requiredCapabilities[0];
  const trigger = {
    id: "t",
    type: "trigger",
    label: first ? `${first.product} trigger` : "Trigger",
    config: {
      ...(first ? { product: first.product, eventType: EVENT_BY_CAPABILITY[first.capability] ?? "event.received" } : {}),
    },
  };
  const steps = plan.steps.slice(0, 8).map((s, i) => ({
    id: `n${i + 1}`,
    type: "log",
    label: s.label ?? `${s.provider} · ${s.action}`,
    config: { message: `${s.provider}.${s.action} — configure this step in the builder` },
  }));
  const nodes = [trigger, ...steps];
  const edges = nodes.slice(1).map((n, i) => ({ id: `e${i + 1}`, source: i === 0 ? "t" : `n${i}`, target: n.id }));
  return { nodes, edges };
}

export default function CommandPage() {
  const { workspace } = useSession();
  const [prompt, setPrompt] = useState("When someone comments PRICE, send them a DM and create a lead.");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  async function ask() {
    setError(null);
    setPlan(null);
    setBusy(true);
    try {
      setPlan(await api<Plan>("/api/v1/ai/plan", { method: "POST", body: JSON.stringify({ prompt }) }));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Planning failed";
      setError(msg);
      toast.error("Planning failed", msg);
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!plan) return;
    setError(null);
    setSaving(true);
    try {
      const wf = await api<{ id: string }>("/api/v1/workflows", {
        method: "POST",
        body: JSON.stringify({
          name: plan.intent.replace(/_/g, " "),
          ...(workspace ? { workspaceId: workspace.id } : {}),
          definition: planToDefinition(plan),
        }),
        confirm: plan.needsConfirmation,
      });
      window.location.href = `/workflows/${wf.id}`;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not save draft";
      setError(msg);
      toast.error("Save failed", msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <PageHeader title="AI Command Center" body="Explain, diagnose, create, modify, inspect, recommend — execution always passes policy checks." />
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 light:border-indigo-950/10 light:bg-white light:shadow-sm">
        <label className="text-xs font-medium uppercase tracking-widest text-zinc-500" htmlFor="cmd">Ask SocialFlux anything</label>
        <textarea
          id="cmd"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-zinc-100 focus:border-indigo-400/60 focus:outline-none light:border-indigo-950/15 light:bg-white light:text-zinc-900 light:shadow-sm"
        />
        <div className="mt-3 flex justify-end">
          <button onClick={() => void ask()} disabled={busy || prompt.trim().length < 3} className="h-10 rounded-lg bg-indigo-500 px-5 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50">
            {busy ? "Planning…" : "Ask AI"}
          </button>
        </div>
        {error ? <p className="mt-3 text-xs text-red-300 light:text-red-600">{error}</p> : null}
        {plan ? (
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/30 p-4 text-sm light:border-indigo-950/15">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-zinc-400">Intent: <span className="font-mono text-indigo-300">{plan.intent}</span></p>
              <span className="rounded-full bg-white/5 px-2.5 py-1 font-mono text-[11px] text-zinc-400">
                {plan.source} · confidence {Math.round(plan.confidence * 100)}%
              </span>
            </div>
            <p className="mt-3 text-zinc-200">{plan.summary}</p>
            <p className="mt-3 text-xs font-medium uppercase tracking-widest text-zinc-500">Steps</p>
            <ol className="mt-1 space-y-1">
              {plan.steps.map((s, i) => (
                <li key={i} className="font-mono text-xs text-zinc-300">{i + 1}. {s.label ?? `${s.provider} · ${s.action}`}</li>
              ))}
            </ol>
            <p className="mt-3 text-xs font-medium uppercase tracking-widest text-zinc-500">Required permissions</p>
            <ul className="mt-1 space-y-1">{plan.requiredPermissions.map((p) => <li key={p} className="font-mono text-xs text-zinc-400">✓ {p}</li>)}</ul>
            {plan.requiredAssets.length > 0 ? (
              <>
                <p className="mt-3 text-xs font-medium uppercase tracking-widest text-zinc-500">Required assets</p>
                <ul className="mt-1 space-y-1">{plan.requiredAssets.map((a) => <li key={a} className="font-mono text-xs text-zinc-400">▸ {a}</li>)}</ul>
              </>
            ) : null}
            {plan.missingRequirements.length > 0 ? (
              <>
                <p className="mt-3 text-xs font-medium uppercase tracking-widest text-amber-300/80">Before you activate</p>
                <ul className="mt-1 space-y-1">{plan.missingRequirements.map((m, i) => <li key={i} className="text-xs text-zinc-400">⚠ {m}</li>)}</ul>
              </>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => void saveDraft()} disabled={saving} className="h-9 rounded-lg bg-indigo-500 px-4 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50">
                {saving ? "Saving…" : "Save as draft workflow"}
              </button>
              <Link href="/connections" className="inline-flex h-9 items-center rounded-lg border border-white/10 px-4 text-sm text-zinc-200 hover:bg-white/[0.05]">
                Review connections
              </Link>
            </div>
            <p className="mt-3 text-xs text-zinc-600">Destructive or expensive actions will ask for explicit confirmation before execution.</p>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
