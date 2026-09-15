"use client";

import {
  Background,
  Controls,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, Page } from "@/lib/api";

type WfNode = Node<Record<string, unknown>>;
type Status = "draft" | "active" | "paused" | "archived";

const PALETTE = [
  "trigger",
  "condition",
  "filter",
  "delay",
  "ai",
  "send_message",
  "create_lead",
  "webhook",
  "http_request",
  "branch",
  "transform",
  "log",
] as const;

interface Workflow {
  id: string;
  name: string;
  status: Status;
  definition: { nodes: Array<{ id: string; type: string; label: string; config: Record<string, unknown> }>; edges: Array<{ id: string; source: string; target: string; label?: string }> };
}

interface Execution {
  id: string;
  status: string;
  error: string | null;
  createdAt: string;
}

function toFlow(def: Workflow["definition"]): { nodes: WfNode[]; edges: Edge[] } {
  return {
    nodes: def.nodes.map((n, i) => ({
      id: n.id,
      type: "default",
      position: { x: 80 + (i % 3) * 220, y: 60 + Math.floor(i / 3) * 140 },
      data: { label: `${n.label} · ${n.type}`, nodeType: n.type, config: n.config },
      style: {
        background: n.type === "trigger" ? "#1d2440" : "#14151c",
        color: "#e4e4e7",
        border: `1px solid ${n.type === "trigger" ? "#818cf8" : "rgba(255,255,255,0.14)"}`,
        borderRadius: 12,
        fontSize: 12,
        padding: 10,
        minWidth: 150,
      },
    })),
    edges: def.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label, animated: true })),
  };
}

export default function WorkflowBuilderPage({ params }: { params: { id: string } }) {
  const [wf, setWf] = useState<Workflow | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<WfNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<WfNode | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Workflow>(`/api/v1/workflows/${params.id}`)
      .then((w) => {
        setWf(w);
        const { nodes: n, edges: e } = toFlow(w.definition);
        setNodes(n);
        setEdges(e);
      })
      .catch((e: ApiError) => setError(e.message));
    api<Page<Execution>>(`/api/v1/workflows/${params.id}/executions?limit=10`)
      .then((page) => setExecutions(page.items))
      .catch(() => undefined);
  }, [params.id, setNodes, setEdges]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, id: `e_${Date.now()}`, animated: true }, eds)),
    [setEdges],
  );

  function addNode(type: string) {
    const id = `n_${Date.now().toString(36)}`;
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: "default",
        position: { x: 120 + ns.length * 30, y: 120 + ns.length * 20 },
        data: { label: `New ${type}`, nodeType: type, config: defaultConfig(type) },
        style: { background: "#14151c", color: "#e4e4e7", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 12, fontSize: 12, padding: 10, minWidth: 150 },
      },
    ]);
  }

  async function save() {
    if (!wf) return;
    setError(null);
    setNotice(null);
    const definition = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: String(n.data.nodeType ?? "log"),
        label: String(n.data.label ?? n.id).split(" · ")[0],
        config: (n.data.config ?? {}) as Record<string, unknown>,
      })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: typeof e.label === "string" ? e.label : undefined })),
    };
    try {
      const updated = await api<Workflow>(`/api/v1/workflows/${wf.id}`, {
        method: "PATCH",
        body: JSON.stringify({ definition }),
      });
      setWf(updated);
      setNotice("Saved and validated.");
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message}${e.code === "confirmation_required" ? " (sends need confirmation — activate from Automations)" : ""}` : "Save failed");
    }
  }

  async function setStatus(status: Status) {
    if (!wf) return;
    setError(null);
    try {
      const updated = await api<Workflow>(`/api/v1/workflows/${wf.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
        confirm: true,
      });
      setWf(updated);
      setNotice(`Workflow ${status}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Status change failed");
    }
  }

  function updateSelected(patch: Record<string, unknown>) {
    if (!selected) return;
    const next = { ...selected, data: { ...selected.data, ...patch } };
    setSelected(next);
    setNodes((ns) => ns.map((n) => (n.id === next.id ? next : n)));
  }

  if (error && !wf) return <p className="py-10 text-center text-sm text-red-300">{error}</p>;
  if (!wf) return <p className="py-10 text-center text-sm text-zinc-500">Loading workflow…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">{wf.name}</h1>
          <p className="text-xs text-zinc-500">Status: <span className="text-zinc-200">{wf.status}</span> · drag nodes, connect edges, click a node to configure</p>
        </div>
        <div className="flex gap-2">
          {wf.status !== "active" ? (
            <button onClick={() => void setStatus("active")} className="h-9 rounded-lg bg-indigo-500 px-4 text-sm font-medium text-white hover:bg-indigo-400">Activate</button>
          ) : (
            <button onClick={() => void setStatus("paused")} className="h-9 rounded-lg border border-white/10 px-4 text-sm text-zinc-200 hover:bg-white/5">Pause</button>
          )}
          <button onClick={() => void save()} className="h-9 rounded-lg border border-white/10 px-4 text-sm text-zinc-200 hover:bg-white/5">Save</button>
        </div>
      </div>

      {notice ? <p className="rounded-lg border border-emerald-400/25 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200">{notice}</p> : null}
      {error ? <p className="rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2 text-xs text-red-200">{error}</p> : null}

      <div className="flex flex-wrap gap-1.5">
        {PALETTE.map((t) => (
          <button key={t} onClick={() => addNode(t)} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] text-zinc-300 hover:bg-white/[0.07]">
            + {t}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="h-[480px] overflow-hidden rounded-2xl border border-white/10 bg-ink-900">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelected(n as WfNode)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} />
            <Controls />
          </ReactFlow>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Selected node</p>
            {!selected ? (
              <p className="mt-2 text-xs text-zinc-500">Click a node to edit its label and config. Config is a JSON object — templates like {"{{event.senderId}}"} are supported.</p>
            ) : (
              <div className="mt-2 space-y-2">
                <label className="block text-xs text-zinc-400">Label
                  <input
                    value={String(selected.data.label ?? "")}
                    onChange={(e) => updateSelected({ label: e.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/40 px-2 font-mono text-xs text-zinc-100"
                  />
                </label>
                <label className="block text-xs text-zinc-400">Config (JSON)
                  <textarea
                    rows={10}
                    value={JSON.stringify(selected.data.config ?? {}, null, 2)}
                    onChange={(e) => {
                      try {
                        updateSelected({ config: JSON.parse(e.target.value) as Record<string, unknown> });
                      } catch {
                        // Allow mid-typing invalid JSON; validated on save.
                      }
                    }}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 font-mono text-[11px] text-zinc-100"
                  />
                </label>
                <button
                  onClick={() => {
                    setNodes((ns) => ns.filter((n) => n.id !== selected.id));
                    setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id));
                    setSelected(null);
                  }}
                  className="h-8 rounded-lg border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10"
                >
                  Delete node
                </button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Recent executions</p>
            {executions.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">No runs yet. Activate the workflow and send a matching event.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {executions.map((e) => (
                  <li key={e.id} className="flex items-center justify-between font-mono text-[11px] text-zinc-400">
                    <span>{e.id.slice(0, 14)}…</span>
                    <span className={e.status === "succeeded" ? "text-emerald-300" : e.status === "failed" ? "text-red-300" : "text-amber-300"}>{e.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function defaultConfig(type: string): Record<string, unknown> {
  switch (type) {
    case "trigger":
      return { product: "instagram", eventType: "comment.created", keyword: "PRICE" };
    case "filter":
      return { keyword: "BUY" };
    case "condition":
    case "branch":
      return { field: "vars.text", operator: "contains", value: "vip" };
    case "delay":
      return { seconds: 60 };
    case "send_message":
      return { channel: "whatsapp", recipient: "{{event.senderId}}", text: "Thanks for reaching out!" };
    case "create_lead":
      return { phone: "{{event.senderId}}" };
    case "webhook":
    case "http_request":
      return { url: "https://example.com/hook", method: "POST" };
    case "ai":
      return { prompt: "Reply briefly to: {{vars.text}}", as: "ai_reply" };
    case "transform":
      return { template: "{{vars.text}}", as: "transformed" };
    default:
      return { message: "Reached {{event.eventId}}" };
  }
}
