"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyBlock, ErrorBlock, LoadingBlock, timeAgo } from "@/components/data-states";
import { api, ApiError, Page } from "@/lib/api";
import { useSession } from "@/lib/use-session";

interface Connection {
  id: string;
  product: string;
  status: string;
  scopes: string[];
  webhookStatus: string | null;
  lastEventAt: string | null;
  assetCount: number;
}

interface Workflow {
  id: string;
  status: string;
}

interface EventItem {
  id: string;
  status: string;
}

interface Usage {
  apiRequests: number;
  events: number;
  executions: number;
  aiSpendCents: number;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const PRODUCT_LABEL: Record<string, string> = { instagram: "Instagram", whatsapp: "WhatsApp", facebook: "Facebook" };

export default function HomePage() {
  const { org, workspace, loading: sessionLoading, usingDevFallback } = useSession();
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setError(null);
    Promise.all([
      api<Connection[]>("/api/v1/connections"),
      api<Page<Workflow>>("/api/v1/workflows?limit=100"),
      api<Page<EventItem>>("/api/v1/events?limit=20"),
      api<Usage>("/api/v1/usage"),
    ])
      .then(([c, w, e, u]) => {
        setConnections(c);
        setWorkflows(w.items);
        setEvents(e.items);
        setUsage(u);
      })
      .catch((e: ApiError) => setError(e.message));
  }

  useEffect(() => {
    if (!sessionLoading) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, org?.id, workspace?.id]);

  if (sessionLoading || !connections || !workflows || !events || !usage) {
    return (
      <AppShell>
        <PageHeader title={greeting()} body={org ? `Here's what's happening in ${org.name}.` : "Here's what's happening."} />
        {error ? <ErrorBlock message={error} onRetry={refresh} /> : <LoadingBlock />}
      </AppShell>
    );
  }

  const attention = connections.filter((c) => c.status === "action_required" || c.status === "disconnected");
  const active = workflows.filter((w) => w.status === "active").length;
  const paused = workflows.filter((w) => w.status === "paused").length;
  const failedEvents = events.filter((e) => e.status === "failed" || e.status === "dead_letter");
  const healthy = connections.length > 0 && attention.length === 0;

  return (
    <AppShell>
      <PageHeader
        title={greeting()}
        body={
          connections.length === 0
            ? "Connect your first Meta account and MetaFlux configures the rest."
            : healthy
              ? "Your Meta environment is healthy."
              : `${attention.length} connection${attention.length === 1 ? "" : "s"} need${attention.length === 1 ? "s" : ""} attention.`
        }
        action={
          <Link href="/command" className="inline-flex h-9 items-center rounded-lg bg-indigo-500 px-4 text-sm font-medium text-white hover:bg-indigo-400">
            What do you want to do?
          </Link>
        }
      />
      {error ? <div className="mb-4"><ErrorBlock message={error} onRetry={refresh} /></div> : null}

      {connections.length === 0 ? (
        <EmptyBlock
          title="Your Meta workspace is empty"
          body="Connect Instagram, WhatsApp or Facebook and let MetaFlux discover your assets, permissions and webhooks."
          action={<Link href="/connections" className="inline-flex h-10 items-center rounded-lg bg-indigo-500 px-5 text-sm font-medium text-white hover:bg-indigo-400">Connect Meta</Link>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {connections.map((c) => {
            const ok = c.status === "connected";
            return (
              <Link key={c.id} href="/connections" className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.04]">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-100">{PRODUCT_LABEL[c.product] ?? c.product}</p>
                  <span className={`inline-flex items-center gap-1.5 text-xs ${ok ? "text-emerald-300" : "text-amber-300"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} />
                    {ok ? "Connected" : c.status.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {c.assetCount} asset{c.assetCount === 1 ? "" : "s"} · {c.scopes.length} scopes · last event {timeAgo(c.lastEventAt)}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-sm font-medium text-white">Automations</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {active} <span className="text-sm font-normal text-zinc-500">active{paused > 0 ? ` · ${paused} paused` : ""}</span>
          </p>
          <Link href="/automations" className="mt-2 inline-block text-xs text-indigo-300 hover:text-indigo-200">View automations →</Link>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-sm font-medium text-white">Last 30 days</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {usage.events.toLocaleString()} <span className="text-sm font-normal text-zinc-500">events · {usage.executions.toLocaleString()} executions · {usage.apiRequests.toLocaleString()} API calls</span>
          </p>
          <Link href="/analytics" className="mt-2 inline-block text-xs text-indigo-300 hover:text-indigo-200">View analytics →</Link>
        </div>
      </div>

      {attention.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/[0.04] p-5">
          <p className="text-sm font-medium text-amber-200">AI recommendation</p>
          <p className="mt-1 text-sm text-zinc-300">
            {attention.map((c) => PRODUCT_LABEL[c.product] ?? c.product).join(", ")} need{(attention.length === 1 ? "s" : "")} attention
            {failedEvents.length > 0 ? ` · ${failedEvents.length} recent event${failedEvents.length === 1 ? "" : "s"} failed` : ""}.
            Reconnect to restore automations.
          </p>
          <Link href="/health" className="mt-3 inline-flex h-9 items-center rounded-lg border border-amber-400/30 px-4 text-sm text-amber-200 hover:bg-amber-400/10">
            Fix now
          </Link>
        </div>
      ) : null}
      {usingDevFallback ? (
        <p className="mt-4 text-xs text-zinc-600">Local dev mode — <Link href="/signin" className="underline hover:text-zinc-400">sign in</Link> to see your workspace.</p>
      ) : null}
    </AppShell>
  );
}
