import { AppShell, PageHeader } from "@/components/app-shell";

export default function EventsPage() {
  return (
    <AppShell>
      <PageHeader title="Events" body="Every webhook event is inspectable, replayable and auditable." action={<button className="h-9 rounded-lg border border-white/10 px-4 text-sm text-zinc-200">Replay</button>} />
      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-zinc-500">
            <tr><th className="px-4 py-3">Event</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Workflow</th><th className="px-4 py-3">Result</th></tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06] text-zinc-300">
            {[
              ["#92831", "instagram · comment.created", "Lead Capture", "SUCCESS"],
              ["#92830", "whatsapp · message.status", "Appointment link", "SUCCESS"],
              ["#92829", "facebook · comments", "Support triage", "RETRIED"],
            ].map(([id, t, w, r]) => (
              <tr key={id}><td className="px-4 py-3 font-mono text-xs">{id}</td><td className="px-4 py-3">{t}</td><td className="px-4 py-3">{w}</td><td className={`px-4 py-3 text-xs ${r === "SUCCESS" ? "text-emerald-300" : "text-amber-300"}`}>{r}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
