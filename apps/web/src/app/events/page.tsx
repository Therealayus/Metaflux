"use client";

import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyBlock, ErrorBlock, LoadingBlock, timeAgo } from "@/components/data-states";
import { api, ApiError, Page } from "@/lib/api";
import { useSession } from "@/lib/use-session";

interface EventItem {
  id: string;
  product: string;
  eventType: string;
  eventId: string;
  status: string;
  attemptCount: number;
  receivedAt: string;
  processedAt: string | null;
  error: string | null;
}

interface EventDetail extends EventItem {
  payload: unknown;
  storage: string;
  truncated: boolean;
}

function statusTone(status: string): string {
  if (status === "processed") return "text-emerald-300";
  if (status === "failed" || status === "dead_letter") return "text-red-300";
  return "text-amber-300";
}

export default function EventsPage() {
  const { loading: sessionLoading } = useSession();
  const [items, setItems] = useState<EventItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function refresh(cursor?: string) {
    setError(null);
    api<Page<EventItem>>(
      `/api/v1/events?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    )
      .then((page) => {
        setItems((prev) => (cursor && prev ? [...prev, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      })
      .catch((e: ApiError) => setError(e.message));
  }

  useEffect(() => {
    if (!sessionLoading) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading]);

  async function inspect(id: string) {
    setError(null);
    try {
      setSelected(await api<EventDetail>(`/api/v1/events/${id}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load event");
    }
  }

  async function replay(id: string) {
    setError(null);
    setNotice(null);
    try {
      await api(`/api/v1/events/${id}/replay`, { method: "POST" });
      setNotice(`Event requeued for processing.`);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Replay failed");
    }
  }

  async function sendTest() {
    setError(null);
    setNotice(null);
    try {
      const out = await api<{ eventId: string }>("/api/v1/webhooks/meta/test", {
        method: "POST",
        body: JSON.stringify({ product: "instagram", eventType: "comment.created", payload: { text: "PRICE please" } }),
      });
      setNotice(`Test event ${out.eventId} accepted — watch it arrive below.`);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Test event failed");
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Events"
        body="Every webhook event is inspectable, replayable and auditable."
        action={
          <button onClick={() => void sendTest()} className="h-9 rounded-lg border border-white/10 px-4 text-sm text-zinc-200 hover:bg-white/[0.05]">
            Send test event
          </button>
        }
      />
      {notice ? <p className="mb-4 rounded-lg border border-emerald-400/25 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200">{notice}</p> : null}
      {error ? <div className="mb-4"><ErrorBlock message={error} onRetry={() => refresh()} /></div> : null}
      {!items ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyBlock
          title="No events yet"
          body="Events arrive here the moment Meta delivers a webhook — or send a synthetic test event to watch the pipeline work."
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-zinc-500">
                <tr><th className="px-4 py-3">Event</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Result</th></tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-zinc-300">
                {items.map((e) => (
                  <tr key={e.id} onClick={() => void inspect(e.id)} className="cursor-pointer hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-mono text-xs">{e.eventId.length > 42 ? `${e.eventId.slice(0, 42)}…` : e.eventId}</td>
                    <td className="px-4 py-3">{e.product} · {e.eventType}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{timeAgo(e.receivedAt)}</td>
                    <td className={`px-4 py-3 text-xs ${statusTone(e.status)}`}>{e.status.toUpperCase()}{e.attemptCount > 1 ? ` · ${e.attemptCount} tries` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-2">
            {nextCursor ? (
              <button onClick={() => refresh(nextCursor)} className="h-9 rounded-lg border border-white/10 px-4 text-sm text-zinc-200 hover:bg-white/[0.05]">
                Load more
              </button>
            ) : null}
          </div>
        </>
      )}
      {selected ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-xs text-zinc-200">{selected.eventId}</p>
            <div className="flex gap-2">
              <button onClick={() => void replay(selected.id)} className="h-8 rounded-lg border border-white/10 px-3 text-xs text-zinc-200 hover:bg-white/[0.05]">Replay</button>
              <button onClick={() => setSelected(null)} className="h-8 rounded-lg border border-white/10 px-3 text-xs text-zinc-400 hover:bg-white/[0.05]">Close</button>
            </div>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {selected.product} · {selected.eventType} · {selected.status} · storage: {selected.storage}
            {selected.truncated ? " · truncated for display" : ""} · {selected.error ?? "no error"}
          </p>
          <pre className="mt-3 max-h-96 overflow-auto rounded-xl border border-white/[0.07] bg-black/40 p-4 font-mono text-[11px] leading-relaxed text-zinc-300">
            {JSON.stringify(selected.payload, null, 2)}
          </pre>
        </div>
      ) : null}
    </AppShell>
  );
}
