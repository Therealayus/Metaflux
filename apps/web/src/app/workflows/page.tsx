import { AppShell, PageHeader } from "@/components/app-shell";

export default function WorkflowsPage() {
  return (
    <AppShell>
      <PageHeader title="Workflow builder" body="Trigger → condition → DM → phone capture → WhatsApp → lead. Async, durable, idempotent." />
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center font-mono text-[13px] text-zinc-300">
        <p>Instagram Comment</p><p className="text-zinc-600">↓</p>
        <p>Contains “BUY”?</p><p className="text-zinc-600">↓ YES</p>
        <p>Send DM → Collect phone → Send WhatsApp → Create Lead</p>
        <p className="mt-4 font-sans text-xs text-zinc-500">Visual React-Flow canvas + execution history land in Phase 4. Definitions already validate via POST /api/v1/workflows/validate.</p>
      </div>
    </AppShell>
  );
}
