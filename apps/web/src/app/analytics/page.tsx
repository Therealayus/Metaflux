import { AppShell, PageHeader } from "@/components/app-shell";

export default function AnalyticsPage() {
  return (
    <AppShell>
      <PageHeader title="Analytics" body="Events, success rate, retries, latency and AI cost — aggregated async, never computed per request." />
      <div className="grid gap-4 sm:grid-cols-4">
        {[["Events", "18,423"], ["Success", "97.7%"], ["p95 latency", "310ms"], ["AI spend", "$12.40"]].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-xs text-zinc-500">{k}</p>
            <p className="mt-1 text-xl font-semibold text-white">{v}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
