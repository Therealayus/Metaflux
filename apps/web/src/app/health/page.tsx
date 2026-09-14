import { AppShell, PageHeader } from "@/components/app-shell";

const ROWS = [
  ["Token", "Healthy", "ok"],
  ["Permissions", "7 / 8 — pages_messaging missing", "warn"],
  ["Webhook", "Facebook subscription inactive", "warn"],
  ["API", "Healthy · p95 210ms", "ok"],
  ["Last event", "2 minutes ago", "ok"],
] as const;

export default function HealthPage() {
  return (
    <AppShell>
      <PageHeader title="Integration health" body="One honest status per connection. No raw stack traces — cause, impact and fix." />
      <div className="space-y-3">
        {ROWS.map(([k, v, t]) => (
          <div key={k} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-sm font-medium text-white">{k}</p>
            <p className={`text-xs ${t === "ok" ? "text-emerald-300" : "text-amber-300"}`}>{v}</p>
          </div>
        ))}
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.04] p-5">
          <p className="text-sm font-medium text-amber-200">Action required</p>
          <p className="mt-1 text-sm text-zinc-300">Your Facebook messaging permission is no longer available. 1 automation is paused.</p>
          <button className="mt-3 h-9 rounded-lg bg-amber-400/15 px-4 text-sm text-amber-200">Fix connection</button>
        </div>
      </div>
    </AppShell>
  );
}
