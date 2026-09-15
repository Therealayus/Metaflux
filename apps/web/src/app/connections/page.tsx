"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyBlock, ErrorBlock, LoadingBlock, timeAgo } from "@/components/data-states";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/use-session";

interface Connection {
  id: string;
  product: string;
  workspaceId: string;
  status: string;
  scopes: string[];
  webhookStatus: string | null;
  lastEventAt: string | null;
  assetCount: number;
}

interface Workspace {
  id: string;
  name: string;
}

const PRODUCTS = [
  { id: "instagram", label: "Instagram", hint: "Business accounts, comments, messaging, insights" },
  { id: "whatsapp", label: "WhatsApp", hint: "Business accounts, templates, message status" },
  { id: "facebook", label: "Facebook", hint: "Pages, comments, messaging" },
];

function ConnectionsInner() {
  const params = useSearchParams();
  const { workspace, workspaces, loading: sessionLoading } = useSession();
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const connectedParam = params.get("connected");
  const errorParam = params.get("error");

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

  async function connect(product: string) {
    setError(null);
    setBusy(product);
    try {
      const wsId = workspace?.id ?? (await api<Workspace[]>("/api/v1/workspaces"))[0]?.id;
      if (!wsId) throw new Error("Create a workspace first (Settings → workspaces are created at signup).");
      const { url } = await api<{ url: string }>(
        `/api/v1/connections/meta/start?product=${product}&workspaceId=${wsId}`,
      );
      window.location.href = url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start Meta connection");
      setBusy(null);
    }
  }

  async function disconnect(id: string, product: string) {
    if (!window.confirm(`Disconnect ${product}? Tokens are deleted and dependent automations stop.`)) return;
    setError(null);
    try {
      await api(`/api/v1/connections/${id}`, { method: "DELETE", confirm: true });
      setNotice(`${product} disconnected.`);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Disconnect failed");
    }
  }

  return (
    <>
      {connectedParam ? (
        <p className="mb-4 rounded-lg border border-emerald-400/25 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200">
          {connectedParam} connected. Run discovery below to import its assets.
        </p>
      ) : null}
      {errorParam ? (
        <p className="mb-4 rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2 text-xs text-red-200">
          Connection failed: {decodeURIComponent(errorParam)}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-lg border border-emerald-400/25 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200">{notice}</p>
      ) : null}
      {error ? <div className="mb-4"><ErrorBlock message={error} onRetry={refresh} /></div> : null}

      {!connections ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {PRODUCTS.map((p) => {
              const conn = connections.find((c) => c.product === p.id);
              const ok = conn?.status === "connected";
              return (
                <div key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">{p.label}</p>
                    {conn ? (
                      <span className={`text-xs ${ok ? "text-emerald-300" : "text-amber-300"}`}>
                        ● {ok ? "Connected" : conn.status.replace(/_/g, " ")}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">● Not connected</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">{p.hint}</p>
                  {conn ? (
                    <p className="mt-2 text-xs text-zinc-500">
                      {conn.assetCount} assets · {conn.scopes.length} scopes · last event {timeAgo(conn.lastEventAt)}
                    </p>
                  ) : null}
                  <div className="mt-4 flex gap-2">
                    {conn ? (
                      <>
                        <Link href="/health" className="inline-flex h-8 items-center rounded-lg border border-white/10 px-3 text-xs text-zinc-200 hover:bg-white/[0.05]">
                          Health
                        </Link>
                        <button
                          onClick={() => void disconnect(conn.id, p.label)}
                          className="inline-flex h-8 items-center rounded-lg border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10"
                        >
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => void connect(p.id)}
                        disabled={busy === p.id}
                        className="inline-flex h-8 items-center rounded-lg bg-indigo-500 px-3 text-xs font-medium text-white hover:bg-indigo-400 disabled:opacity-60"
                      >
                        {busy === p.id ? "Opening Meta…" : `Connect ${p.label}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {connections.length === 0 ? (
            <div className="mt-4">
              <EmptyBlock
                title="No connections yet"
                body="Pick a product above. MetaFlux handles OAuth, token storage, asset discovery and webhook setup."
              />
            </div>
          ) : null}
          {workspaces.length === 0 && connections.length > 0 ? (
            <p className="mt-4 text-xs text-zinc-500">No workspaces found — new accounts get one automatically at signup.</p>
          ) : null}
        </>
      )}
    </>
  );
}

export default function ConnectionsPage() {
  return (
    <AppShell>
      <PageHeader title="Connections" body="Guided Meta connection with permission intelligence and health per product." />
      <Suspense fallback={<LoadingBlock />}>
        <ConnectionsInner />
      </Suspense>
    </AppShell>
  );
}
