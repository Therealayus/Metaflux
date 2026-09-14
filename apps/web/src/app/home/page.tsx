import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";

export default function HomePage() {
  return (
    <AppShell>
      <PageHeader
        title="Good morning"
        body="Your Meta environment is healthy."
        action={
          <Link href="/command" className="inline-flex h-9 items-center rounded-lg bg-indigo-500 px-4 text-sm font-medium text-white hover:bg-indigo-400">
            What do you want to do?
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Instagram", "Connected", "ok"],
          ["WhatsApp", "Connected", "ok"],
          ["Facebook", "Action required", "warn"],
        ].map(([p, s]) => (
          <div key={p} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-100">{p}</p>
              <span className={`inline-flex items-center gap-1.5 text-xs ${s === "Connected" ? "text-emerald-300" : "text-amber-300"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s === "Connected" ? "bg-emerald-400" : "bg-amber-400"}`} />{s}
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">Token healthy · Webhook healthy · Last event 2m ago</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-sm font-medium text-white">Automations</p>
          <p className="mt-1 text-2xl font-semibold text-white">12 <span className="text-sm font-normal text-zinc-500">active · 2 need attention</span></p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-sm font-medium text-white">Last 24 hours</p>
          <p className="mt-1 text-2xl font-semibold text-white">18,423 <span className="text-sm font-normal text-zinc-500">events · 17,992 successful · 431 retried</span></p>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/[0.04] p-5">
        <p className="text-sm font-medium text-amber-200">AI recommendation</p>
        <p className="mt-1 text-sm text-zinc-300">Your Facebook Page webhook subscription is inactive — 2 workflows may miss new comments.</p>
        <Link href="/health" className="mt-3 inline-flex h-9 items-center rounded-lg border border-amber-400/30 px-4 text-sm text-amber-200 hover:bg-amber-400/10">
          Fix now
        </Link>
      </div>
    </AppShell>
  );
}
