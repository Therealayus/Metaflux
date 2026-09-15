"use client";

import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Overview {
  queueDepth: number;
  dlqDepth: number;
  flags: Record<string, { enabled: boolean; percentage?: number; allowOrgs?: string[]; denyOrgs?: string[] }>;
  plans: string[];
}

interface DlqItem {
  jobName: string;
  idempotencyKey: string;
  attempts: number;
  error: string;
  failedAt: string;
}

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [dlq, setDlq] = useState<DlqItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flagName, setFlagName] = useState("");
  const [flagPct, setFlagPct] = useState("50");

  function headers(): Record<string, string> {
    return { Authorization: `Bearer ${key}` };
  }

  async function load(k: string) {
    const res = await fetch(`${API_URL}/api/v1/admin/overview`, { headers: { Authorization: `Bearer ${k}` } });
    if (!res.ok) throw new Error(res.status === 501 ? "Admin console is disabled on this instance" : "Invalid admin key");
    const body = (await res.json()) as { data: Overview };
    setOverview(body.data);
    const dlqRes = await fetch(`${API_URL}/api/v1/admin/dlq?limit=10`, { headers: { Authorization: `Bearer ${k}` } });
    if (dlqRes.ok) {
      const dlqBody = (await dlqRes.json()) as { data: DlqItem[] };
      setDlq(dlqBody.data);
    }
    setAuthed(true);
  }

  async function submitKey(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      window.sessionStorage.setItem("mf.admin", key);
      await load(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function toggleFlag(name: string, enabled: boolean, percentage?: number) {
    setError(null);
    const res = await fetch(`${API_URL}/api/v1/admin/flags/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, percentage }),
    });
    if (!res.ok) {
      setError("Flag update failed");
      return;
    }
    await load(key);
  }

  if (!authed) {
    return (
      <AppShell>
        <PageHeader title="Admin console" body="Separate secure surface. Requires the instance ADMIN_API_KEY — never a user session." />
        <form onSubmit={(e) => void submitKey(e)} className="max-w-md space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <label className="block text-xs text-zinc-400">Admin key
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="…" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-2 font-mono text-sm text-zinc-100" />
          </label>
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
          <button className="h-10 rounded-lg bg-indigo-500 px-5 text-sm font-medium text-white hover:bg-indigo-400">Unlock</button>
        </form>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="Admin console" body="System health, dead letters and feature flags. Every change is logged." />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Queue depth", String(overview?.queueDepth ?? 0)],
          ["Dead letters", String(overview?.dlqDepth ?? 0)],
          ["Plans", (overview?.plans ?? []).join(", ")],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-xs text-zinc-500">{k}</p>
            <p className="mt-1 font-mono text-lg text-white">{v}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Feature flags</p>
          <div className="mt-3 flex gap-2">
            <input value={flagName} onChange={(e) => setFlagName(e.target.value)} placeholder="new.flag" className="h-9 flex-1 rounded-lg border border-white/10 bg-black/40 px-2 font-mono text-xs text-zinc-100" />
            <input value={flagPct} onChange={(e) => setFlagPct(e.target.value)} placeholder="50" className="h-9 w-16 rounded-lg border border-white/10 bg-black/40 px-2 font-mono text-xs text-zinc-100" />
            <button onClick={() => void toggleFlag(flagName || "untitled", true, Number(flagPct) || 0)} className="h-9 rounded-lg border border-white/10 px-3 text-xs text-zinc-200">Set</button>
          </div>
          <ul className="mt-3 space-y-2">
            {Object.entries(overview?.flags ?? {}).map(([name, f]) => (
              <li key={name} className="flex items-center justify-between rounded-lg border border-white/[0.07] px-3 py-2 font-mono text-xs">
                <span className="text-zinc-200">{name} <span className="text-zinc-500">{f.percentage !== undefined ? `${f.percentage}%` : f.enabled ? "on" : "off"}</span></span>
                <span className="flex gap-1.5">
                  <button onClick={() => void toggleFlag(name, true, 100)} className="rounded border border-emerald-400/30 px-2 py-0.5 text-emerald-200">on</button>
                  <button onClick={() => void toggleFlag(name, false, 0)} className="rounded border border-white/10 px-2 py-0.5 text-zinc-400">off</button>
                </span>
              </li>
            ))}
          </ul>
          {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Dead letters (metadata only)</p>
          {dlq.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500">Queue is healthy — nothing dead-lettered.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {dlq.map((d, i) => (
                <li key={i} className="rounded-lg border border-white/[0.07] px-3 py-2 font-mono text-[11px] text-zinc-300">
                  <p>{d.jobName} · attempts {d.attempts}</p>
                  <p className="text-red-300">{d.error}</p>
                  <p className="text-zinc-600">{d.failedAt}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
