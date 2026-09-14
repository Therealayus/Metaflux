import { AppShell, PageHeader } from "@/components/app-shell";

export default function BillingPage() {
  return (
    <AppShell>
      <PageHeader title="Billing" body="Growth plan · usage metered async across API, events, executions and AI tokens." />
      <div className="grid gap-4 sm:grid-cols-3">
        {[["Workflows", "14 / 50"], ["API calls", "82k / 500k"], ["AI tokens", "1.2M / 5M"]].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-xs text-zinc-500">{k}</p>
            <p className="mt-1 text-xl font-semibold text-white">{v}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
