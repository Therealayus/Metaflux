"use client";

import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/components/toaster";

interface Key {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

const SCOPES = ["messages:send", "events:read", "workflows:read", "workflows:write", "leads:read", "assets:read", "ai:use"];

export default function DeveloperPage() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("Production");
  const [scopes, setScopes] = useState<string[]>(["messages:send", "events:read"]);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setKeys(await api<Key[]>("/api/v1/keys"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load keys");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function toggleScope(s: string) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function create() {
    setError(null);
    setFreshKey(null);
    try {
      const rec = await api<Key & { key: string }>("/api/v1/keys", {
        method: "POST",
        body: JSON.stringify({ name, scopes }),
      });
      setFreshKey(rec.key);
      await refresh();
      toast.success("API key created", "Copy it now — it won't be shown again.");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Create failed";
      setError(msg);
      toast.error("Key creation failed", msg);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await api(`/api/v1/keys/${id}/revoke`, { method: "POST" });
      await refresh();
      toast.success("API key revoked");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Revoke failed";
      setError(msg);
      toast.error("Revoke failed", msg);
    }
  }

  return (
    <AppShell>
      <PageHeader title="Developer console" body="API keys are shown once and stored as hashes. Manage scopes and revoke anytime." />
      {error ? <p className="mb-4 rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2 text-xs text-red-200 light:text-red-700">{error}</p> : null}
      {freshKey ? (
        <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] p-4 light:bg-amber-400/10">
          <p className="text-xs text-amber-200 light:text-amber-800">Copy this key now — it will never be shown again.</p>
          <p className="mt-1 select-all font-mono text-sm text-white light:text-zinc-900">{freshKey}</p>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5 light:border-indigo-950/10 light:bg-white light:shadow-sm">
          <label className="block text-xs text-zinc-400 light:text-zinc-500">Key name
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-sm text-zinc-100 light:border-indigo-950/15 light:bg-white light:text-zinc-900 light:shadow-sm" />
          </label>
          <div>
            <p className="text-xs text-zinc-400 light:text-zinc-500">Scopes</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {SCOPES.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleScope(s)}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] ${scopes.includes(s) ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-200 light:border-indigo-600/40 light:bg-indigo-600/10 light:text-indigo-700" : "border-white/10 text-zinc-500 light:border-indigo-950/15 light:text-zinc-500"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => void create()} disabled={!name || scopes.length === 0} className="h-10 w-full rounded-lg bg-indigo-500 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50">
            New API key
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10 light:border-indigo-950/10 light:bg-white light:shadow-sm">
          {keys.length === 0 && !error ? (
            <p className="px-4 py-8 text-center text-xs text-zinc-500">No API keys yet. Create one to call SocialFlux programmatically.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-white/[0.06] light:divide-zinc-900/10">
                {keys.map((k) => (
                  <tr key={k.id} className={k.revokedAt ? "opacity-50" : ""}>
                    <td className="px-4 py-3">
                      <p className="text-sm text-white light:text-zinc-900">{k.name}</p>
                      <p className="font-mono text-[11px] text-zinc-500">…{k.prefix} · {k.scopes.join(", ")}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {k.revokedAt ? (
                        <span className="text-xs text-zinc-500">revoked</span>
                      ) : (
                        <button onClick={() => void revoke(k.id)} className="h-8 rounded-lg border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10 light:text-red-600">
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
