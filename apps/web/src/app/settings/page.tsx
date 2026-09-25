"use client";

import { AppShell, PageHeader } from "@/components/app-shell";
import { ErrorBlock, LoadingBlock } from "@/components/data-states";
import { toast } from "@/components/toaster";
import { ApiError } from "@/lib/api";
import { clearSessionCache, useSession } from "@/lib/use-session";

export default function SettingsPage() {
  const { user, orgs, org, workspaces, workspace, loading, error, switchOrg, switchWorkspace, signOut } = useSession();

  async function doSignOut() {
    try {
      await signOut();
      toast.success("Signed out", "See you soon.");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Sign out failed";
      toast.error("Sign out failed", msg);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Settings"
        body="Organization, workspaces, roles and sessions."
        action={
          user ? (
            <button onClick={() => void doSignOut()} className="h-9 rounded-lg border border-white/10 px-4 text-sm text-zinc-200 hover:bg-white/[0.05] light:border-indigo-950/15 light:bg-white light:text-zinc-700 light:shadow-sm light:hover:bg-zinc-50">
              Sign out
            </button>
          ) : undefined
        }
      />
      {error ? <div className="mb-4"><ErrorBlock message={error} onRetry={() => { clearSessionCache(); window.location.reload(); }} /></div> : null}
      {loading ? (
        <LoadingBlock />
      ) : !user || !org ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-300 light:border-indigo-950/10 light:bg-white light:text-zinc-600 light:shadow-sm">
          <p>You are browsing in local dev mode.</p>
          <p className="mt-1 text-zinc-500">Sign in to manage your organizations, workspaces and sessions.</p>
          <a href="/signin" className="mt-3 inline-flex h-9 items-center rounded-lg bg-indigo-500 px-4 text-sm font-medium text-white hover:bg-indigo-400">Sign in</a>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 light:border-indigo-950/10 light:bg-white light:shadow-sm">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Signed in</p>
            <p className="mt-2 text-sm text-zinc-100 light:text-zinc-800">{user.name ?? user.email}</p>
            <p className="font-mono text-xs text-zinc-500">{user.email}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 light:border-indigo-950/10 light:bg-white light:shadow-sm">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Organization</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {orgs.map((o) => (
                <button
                  key={o.id}
                  onClick={() => o.id !== org.id && switchOrg(o.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${o.id === org.id ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-200 light:border-indigo-600/40 light:bg-indigo-600/10 light:text-indigo-700" : "border-white/10 text-zinc-300 hover:bg-white/[0.05] light:border-indigo-950/15 light:text-zinc-600 light:hover:bg-zinc-900/[0.04]"}`}
                >
                  {o.name} <span className="ml-1 text-xs text-zinc-500">{o.role}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 light:border-indigo-950/10 light:bg-white light:shadow-sm">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Workspace</p>
            {workspaces.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No workspaces in this organization yet.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {workspaces.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => w.id !== workspace?.id && switchWorkspace(w.id)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${w.id === workspace?.id ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-200 light:border-indigo-600/40 light:bg-indigo-600/10 light:text-indigo-700" : "border-white/10 text-zinc-300 hover:bg-white/[0.05] light:border-indigo-950/15 light:text-zinc-600 light:hover:bg-zinc-900/[0.04]"}`}
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
