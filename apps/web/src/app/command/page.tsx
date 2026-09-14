"use client";

import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";

export default function CommandPage() {
  const [prompt, setPrompt] = useState("When someone comments PRICE, send them a DM and create a lead.");
  const [plan, setPlan] = useState<null | { intent: string; perms: string[]; assets: string[] }>(null);

  function ask() {
    // Foundation: local draft plan. Wired to POST /api/v1/ai/plan in Phase 2.
    const p = prompt.toLowerCase();
    setPlan({
      intent: p.includes("whatsapp") ? "comment_to_whatsapp" : "comment_to_dm",
      perms: ["instagram_basic", "instagram_manage_comments", "instagram_manage_messages"],
      assets: ["instagram_business_account", "facebook_page"],
    });
  }

  return (
    <AppShell>
      <PageHeader title="AI Command Center" body="Explain, diagnose, create, modify, inspect, recommend — execution always passes policy checks." />
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <label className="text-xs font-medium uppercase tracking-widest text-zinc-500" htmlFor="cmd">Ask MetaFlux anything</label>
        <textarea
          id="cmd"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-zinc-100 focus:border-indigo-400/60 focus:outline-none"
        />
        <div className="mt-3 flex justify-end">
          <button onClick={ask} className="h-10 rounded-lg bg-indigo-500 px-5 text-sm font-medium text-white hover:bg-indigo-400">Ask AI</button>
        </div>
        {plan ? (
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/30 p-4 text-sm">
            <p className="text-zinc-400">Intent: <span className="font-mono text-indigo-300">{plan.intent}</span></p>
            <p className="mt-2 text-zinc-200">Required permissions</p>
            <ul className="mt-1 space-y-1 text-zinc-400">{plan.perms.map((p) => <li key={p} className="font-mono text-xs">✓ {p}</li>)}</ul>
            <p className="mt-3 text-zinc-500">Destructive or expensive actions will ask for explicit confirmation before execution.</p>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
