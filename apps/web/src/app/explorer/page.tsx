"use client";

import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { api, ApiError, Page } from "@/lib/api";

interface SendResult {
  providerMessageId: string;
  channel: string;
  status: string;
  latencyMs: number;
  provider: string;
  apiVersion: string;
}

interface ApiLog {
  id: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  keyId: string | null;
  createdAt: string;
}

export default function ExplorerPage() {
  const [channel, setChannel] = useState("whatsapp");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("Hello from MetaFlux");
  const [apiKey, setApiKey] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<ApiLog[]>([]);

  async function refreshLogs() {
    try {
      const page = await api<Page<ApiLog>>("/api/v1/requests?limit=10");
      setLogs(page.items);
    } catch {
      // Explorer degrades gracefully without log access.
    }
  }

  useEffect(() => {
    void refreshLogs();
  }, []);

  async function send() {
    setError(null);
    setResult(null);
    setBusy(true);
    const started = performance.now();
    try {
      const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        credentials: "include",
        body: JSON.stringify({ channel, recipient, message }),
      });
      const body = (await res.json()) as SendResult & { message?: string; code?: string; requestId?: string };
      const ms = Math.round(performance.now() - started);
      if (!res.ok) throw new Error(body.message ?? `Send failed (${res.status})`);
      setResult(`${res.status} Created · ${body.latencyMs ?? ms}ms\nprovider: ${body.provider} · api: ${body.apiVersion}\n\n${JSON.stringify({ providerMessageId: body.providerMessageId, channel: body.channel, status: body.status }, null, 2)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
      void refreshLogs();
    }
  }

  return (
    <AppShell>
      <PageHeader title="API Explorer" body="POST /v1/messages with live request, response, latency and provider trace." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-zinc-400">Channel
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-sm text-zinc-100">
                <option value="whatsapp">whatsapp</option>
                <option value="instagram">instagram</option>
                <option value="facebook">facebook</option>
              </select>
            </label>
            <label className="block text-xs text-zinc-400">Recipient
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="+15550102030" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-2 font-mono text-sm text-zinc-100" />
            </label>
          </div>
          <label className="block text-xs text-zinc-400">Message
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 text-sm text-zinc-100" />
          </label>
          <label className="block text-xs text-zinc-400">API key (optional — uses your session otherwise)
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="mf_test_…" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-2 font-mono text-sm text-zinc-100" />
          </label>
          <button onClick={() => void send()} disabled={busy || !recipient || !message} className="h-10 rounded-lg bg-indigo-500 px-5 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50">
            {busy ? "Sending…" : "Send request"}
          </button>
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
        </div>
        <pre className="overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-xs text-zinc-200">
          {result ?? "Response will appear here…"}
        </pre>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
        <p className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs font-medium uppercase tracking-widest text-zinc-500">Recent requests</p>
        {logs.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-zinc-500">No requests logged yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-white/[0.06] text-zinc-300">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 font-mono text-xs">{l.method}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{l.path}</td>
                  <td className={`px-4 py-2.5 font-mono text-xs ${l.status < 400 ? "text-emerald-300" : "text-red-300"}`}>{l.status}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{l.latencyMs}ms · {l.keyId ? "api-key" : "session"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
