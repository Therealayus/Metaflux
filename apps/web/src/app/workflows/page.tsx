"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { api, ApiError, Page } from "@/lib/api";

interface Workflow {
  id: string;
  name: string;
  status: string;
  definition: { nodes: Array<{ type: string }> };
}

const STARTER = {
  nodes: [
    { id: "t", type: "trigger", label: "Instagram comment", config: { product: "instagram", eventType: "comment.created", keyword: "PRICE" } },
    { id: "m", type: "send_message", label: "Send DM", config: { channel: "instagram", recipient: "{{event.senderId}}", text: "Thanks! What's the best number to reach you?" } },
    { id: "l", type: "create_lead", label: "Create lead", config: { phone: "{{event.senderId}}" } },
  ],
  edges: [
    { id: "e1", source: "t", target: "m" },
    { id: "e2", source: "m", target: "l" },
  ],
};

export default function WorkflowsPage() {
  const [items, setItems] = useState<Workflow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Page<Workflow>>("/api/v1/workflows").then((page) => setItems(page.items)).catch((e: ApiError) => setError(e.message));
  }, []);

  async function create() {
    setError(null);
    try {
      const wf = await api<Workflow>("/api/v1/workflows", {
        method: "POST",
        body: JSON.stringify({ name: "New automation", definition: STARTER }),
        confirm: true,
      });
      window.location.href = `/workflows/${wf.id}`;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Create failed");
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Workflows"
        body="Trigger → condition → DM → phone capture → WhatsApp → lead. Async, durable, idempotent."
        action={
          <button onClick={() => void create()} className="h-9 rounded-lg bg-indigo-500 px-4 text-sm font-medium text-white hover:bg-indigo-400">
            New workflow
          </button>
        }
      />
      {error ? <p className="mb-4 rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-100">No workflows yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-400">Create your first automation from a starter template, then refine it on the visual canvas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((w) => (
            <Link key={w.id} href={`/workflows/${w.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.04]">
              <div>
                <p className="text-sm font-medium text-white">{w.name}</p>
                <p className="mt-0.5 font-mono text-xs text-zinc-500">{w.definition.nodes.map((n) => n.type).join(" → ")}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs ${w.status === "active" ? "bg-emerald-400/10 text-emerald-300" : "bg-white/5 text-zinc-400"}`}>{w.status}</span>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
