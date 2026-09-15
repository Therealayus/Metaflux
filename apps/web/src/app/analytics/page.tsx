"use client";

import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ErrorBlock, LoadingBlock } from "@/components/data-states";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/use-session";

interface Usage {
  periodDays: number;
  apiRequests: number;
  events: number;
  executions: number;
  aiSpendCents: number;
}

interface AiUsage {
  spentCents: number;
  budgetCents: number;
}

export default function AnalyticsPage() {
  const { loading: sessionLoading } = useSession();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [ai, setAi] = useState<AiUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setError(null);
    Promise.all([api<Usage>("/api/v1/usage"), api<AiUsage>("/api/v1/ai/usage")])
      .then(([u, a]) => {
        setUsage(u);
        setAi(a);
      })
      .catch((e: ApiError) => setError(e.message));
  }

  useEffect(() => {
    if (!sessionLoading) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading]);

  return (
    <AppShell>
      <PageHeader title="Analytics" body="Metered asynchronously across API calls, events, executions and AI tokens." />
      {error ? <div className="mb-4"><ErrorBlock message={error} onRetry={refresh} /></div> : null}
      {!usage || !ai ? (
        <LoadingBlock />
      ) : (
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            ["Events", usage.events.toLocaleString(), `last ${usage.periodDays} days`],
            ["Executions", usage.executions.toLocaleString(), `last ${usage.periodDays} days`],
            ["API calls", usage.apiRequests.toLocaleString(), `last ${usage.periodDays} days`],
            ["AI spend", `$${(usage.aiSpendCents / 100).toFixed(2)} / $${(ai.budgetCents / 100).toFixed(0)} budget`, "this month"],
          ].map(([k, v, sub]) => (
            <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-xs text-zinc-500">{k}</p>
              <p className="mt-1 text-xl font-semibold text-white">{v}</p>
              <p className="mt-0.5 text-[11px] text-zinc-600">{sub}</p>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
