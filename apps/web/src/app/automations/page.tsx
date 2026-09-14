import { AppShell, PageHeader } from "@/components/app-shell";

const FLOWS = [
  { name: "PRICE → DM → Lead", status: "Active", detail: "IG comment trigger · 1,204 runs · 98.1% success" },
  { name: "Teeth-whitening concierge", status: "Active", detail: "AI reply → phone capture → WhatsApp link" },
  { name: "Messenger support triage", status: "Needs attention", detail: "Page webhook inactive — events paused" },
];

export default function AutomationsPage() {
  return (
    <AppShell>
      <PageHeader title="Automations" body="Every automation shows trigger, actions, health and last run." action={<button className="h-9 rounded-lg bg-indigo-500 px-4 text-sm font-medium text-white">Build with AI</button>} />
      <div className="space-y-3">
        {FLOWS.map((f) => (
          <div key={f.name} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div>
              <p className="text-sm font-medium text-white">{f.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{f.detail}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs ${f.status === "Active" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{f.status}</span>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
