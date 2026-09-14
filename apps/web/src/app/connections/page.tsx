import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";

const ROWS = [
  { product: "Instagram", detail: "Business account · 8/8 permissions · webhook healthy", tone: "ok", label: "Connected" },
  { product: "WhatsApp", detail: "WABA + phone · templates synced · webhook healthy", tone: "ok", label: "Connected" },
  { product: "Facebook", detail: "Messaging permission missing — reconnect to restore", tone: "warn", label: "Action required" },
];

export default function ConnectionsPage() {
  return (
    <AppShell>
      <PageHeader title="Connections" body="Guided Meta connection with permission intelligence and health per product." action={<button className="h-9 rounded-lg bg-indigo-500 px-4 text-sm font-medium text-white">Connect Meta</button>} />
      <div className="grid gap-4 md:grid-cols-3">
        {ROWS.map((r) => (
          <div key={r.product} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">{r.product}</p>
              <span className={`text-xs ${r.tone === "ok" ? "text-emerald-300" : "text-amber-300"}`}>● {r.label}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">{r.detail}</p>
            <Link href="/health" className="mt-4 inline-flex h-8 items-center rounded-lg border border-white/10 px-3 text-xs text-zinc-200 hover:bg-white/[0.05]">View health</Link>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
