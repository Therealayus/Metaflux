"use client";

import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyBlock, ErrorBlock, LoadingBlock, timeAgo } from "@/components/data-states";
import { toast } from "@/components/toaster";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/use-session";

interface Connection {
  id: string;
  product: string;
  status: string;
}

interface HealthReport {
  token: string;
  tokenExpiresAt?: string;
  grantedScopes: string[];
  missingScopes: string[];
  webhook: string;
  api: string;
  lastEventAt?: string;
  checkedAt: string;
  state: string;
}

const PRODUCT_LABEL: Record<string, string> = { instagram: "Instagram", whatsapp: "WhatsApp", facebook: "Facebook" };

function Tone({ value, ok }: { value: string; ok: boolean }) {
  return <p className={`text-xs ${ok ? "text-emerald-300 light:text-emerald-700" : "text-amber-300 light:text-amber-600"}`}>{value}</p>;
}

function ConnectionHealth({ conn }: { conn: Connection }) {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function check() {
    setError(null);
    setBusy("check");
    api<HealthReport>(`/api/v1/connections/${conn.id}/health`)
      .then(setReport)
      .catch((e: ApiError) => {
        setError(e.message);
        toast.error("Health check failed", e.message);
      })
      .finally(() => setBusy(null));
  }

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn.id]);

  async function run(action: "discover" | "subscribe") {
    setError(null);
    setBusy(action);
    try {
      if (action === "discover") {
        const out = await api<{ discovered: number }>(`/api/v1/connections/${conn.id}/discover`, { method: "POST" });
        toast.success(`Discovered ${out.discovered} assets`, PRODUCT_LABEL[conn.product] ?? conn.product);
      } else {
        const out = await api<{ webhookStatus: string }>(`/api/v1/connections/${conn.id}/subscribe`, {
          method: "POST",
          body: JSON.stringify({ fields: ["feed", "messages"] }),
        });
        toast.success("Webhooks subscribed", out.webhookStatus);
      }
      check();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : `${action} failed`;
      setError(msg);
      toast.error(action === "discover" ? "Discovery failed" : "Subscription failed", msg);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 light:border-indigo-950/10 light:bg-white light:shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-white light:text-zinc-900">{PRODUCT_LABEL[conn.product] ?? conn.product}</p>
        <div className="flex gap-2">
          <button onClick={() => void run("discover")} disabled={busy !== null} className="h-8 rounded-lg border border-white/10 px-3 text-xs text-zinc-200 hover:bg-white/[0.05] disabled:opacity-50 light:border-indigo-950/15 light:text-zinc-700 light:hover:bg-zinc-900/[0.04]">
            {busy === "discover" ? "Discovering…" : "Discover assets"}
          </button>
          <button onClick={() => void run("subscribe")} disabled={busy !== null} className="h-8 rounded-lg border border-white/10 px-3 text-xs text-zinc-200 hover:bg-white/[0.05] disabled:opacity-50 light:border-indigo-950/15 light:text-zinc-700 light:hover:bg-zinc-900/[0.04]">
            {busy === "subscribe" ? "Subscribing…" : "Subscribe webhooks"}
          </button>
          <button onClick={check} disabled={busy !== null} className="h-8 rounded-lg border border-white/10 px-3 text-xs text-zinc-200 hover:bg-white/[0.05] disabled:opacity-50 light:border-indigo-950/15 light:text-zinc-700 light:hover:bg-zinc-900/[0.04]">
            Refresh
          </button>
        </div>
      </div>
      {error && !report ? <p className="mt-2 text-xs text-red-300 light:text-red-600">{error}</p> : null}
      {!report ? (
        <p className="mt-3 text-xs text-zinc-500">{busy ? "Checking…" : "No report yet."}</p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between"><p className="text-sm text-zinc-300 light:text-zinc-600">Token</p><Tone value={`${report.token}${report.tokenExpiresAt ? ` · expires ${timeAgo(report.tokenExpiresAt)}` : ""}`} ok={report.token === "healthy"} /></div>
          <div className="flex items-center justify-between"><p className="text-sm text-zinc-300 light:text-zinc-600">Permissions</p><Tone value={report.missingScopes.length === 0 ? `${report.grantedScopes.length} granted` : `${report.missingScopes.length} missing: ${report.missingScopes.join(", ")}`} ok={report.missingScopes.length === 0} /></div>
          <div className="flex items-center justify-between"><p className="text-sm text-zinc-300 light:text-zinc-600">Webhook</p><Tone value={report.webhook} ok={report.webhook === "healthy"} /></div>
          <div className="flex items-center justify-between"><p className="text-sm text-zinc-300 light:text-zinc-600">API</p><Tone value={report.api} ok={report.api === "healthy"} /></div>
          <div className="flex items-center justify-between"><p className="text-sm text-zinc-300 light:text-zinc-600">Last event</p><Tone value={timeAgo(report.lastEventAt)} ok={true} /></div>
          {report.state === "action_required" ? (
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.04] p-3 light:bg-amber-400/10">
              <p className="text-xs font-medium text-amber-200 light:text-amber-800">Action required</p>
              <p className="mt-1 text-xs text-zinc-400 light:text-zinc-600">
                {report.token === "invalid" || report.token === "expired"
                  ? "The Meta token is no longer valid. Reconnect the account on the Connections page."
                  : report.missingScopes.length > 0
                    ? "Permissions were revoked. Reconnect and grant every requested permission."
                    : "The webhook subscription is inactive. Use “Subscribe webhooks” above."}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function HealthPage() {
  const { loading: sessionLoading } = useSession();
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setError(null);
    api<Connection[]>("/api/v1/connections")
      .then(setConnections)
      .catch((e: ApiError) => setError(e.message));
  }

  useEffect(() => {
    if (!sessionLoading) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading]);

  return (
    <AppShell>
      <PageHeader title="Integration health" body="One honest status per connection. No raw stack traces — cause, impact and fix." />
      {error ? <div className="mb-4"><ErrorBlock message={error} onRetry={refresh} /></div> : null}
      {!connections ? (
        <LoadingBlock />
      ) : connections.length === 0 ? (
        <EmptyBlock
          title="Nothing to monitor yet"
          body="Health checks appear here once you connect a Meta account. Until then there is nothing to break."
        />
      ) : (
        <div className="space-y-4">
          {connections.map((c) => (
            <ConnectionHealth key={c.id} conn={c} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
