"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/data-states";
import { api, ApiError, Page } from "@/lib/api";
import { useSession } from "@/lib/use-session";

interface Workflow {
  id: string;
  name: string;
  status: string;
  definition: { nodes: Array<{ type: string; label: string }> };
  updatedAt: string;
}

export default function AutomationsPage() {
  const { loading: sessionLoading } = useSession();
  const [items, setItems] = useState<Workflow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setError(null);
    api<Page<Workflow>>("/api/v1/workflows?limit=100")
      .then((page) => setItems(page.items))
      .catch((e: ApiError) => setError(e.message));
  }

  useEffect(() => {
    if (!sessionLoading) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading]);

  return (
    <AppShell>
      <PageHeader
        title="Automations"
        body="Every automation shows trigger, actions, health and last run."
        action={
          <Link href="/command" className="inline-flex h-9 items-center rounded-lg bg-indigo-500 px-4 text-sm font-medium text-white hover:bg-indigo-400">
            Build with AI
          </Link>
        }
      />
      {error ? <div className="mb-4"><ErrorBlock message={error} onRetry={refresh} /></div> : null}
      {!items ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyBlock
          title="No automations yet"
          body="Describe what you want in plain language and SocialFlux plans the integration, permissions and workflow."
          action={<Link href="/command" className="inline-flex h-10 items-center rounded-lg bg-indigo-500 px-5 text-sm font-medium text-white hover:bg-indigo-400">Build with AI</Link>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((w) => (
            <Link key={w.id} href={`/workflows/${w.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.04] light:border-indigo-950/10 light:bg-white light:shadow-sm light:hover:bg-zinc-50">
              <div>
                <p className="text-sm font-medium text-white light:text-zinc-900">{w.name}</p>
                <p className="mt-0.5 font-mono text-xs text-zinc-500">{w.definition.nodes.map((n) => n.type).join(" → ")}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs ${w.status === "active" ? "bg-emerald-400/10 text-emerald-300 light:bg-emerald-500/10 light:text-emerald-700" : w.status === "paused" ? "bg-amber-400/10 text-amber-300 light:bg-amber-400/15 light:text-amber-700" : "bg-white/5 text-zinc-400 light:bg-zinc-900/[0.05] light:text-zinc-500"}`}>
                {w.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
