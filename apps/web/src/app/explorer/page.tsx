import { AppShell, PageHeader } from "@/components/app-shell";

export default function ExplorerPage() {
  return (
    <AppShell>
      <PageHeader title="API Explorer" body="POST /v1/messages with live request, response, latency and provider trace." />
      <div className="grid gap-4 lg:grid-cols-2">
        <pre className="overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-xs text-zinc-200">{`POST /v1/messages\n\n{\n  "channel": "whatsapp",\n  "recipient": "+15550102030",\n  "message": "Hello"\n}`}</pre>
        <pre className="overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-xs text-zinc-400">{`201 Created · 182ms\nprovider: meta · api: v21.0\n\n{\n  "providerMessageId": "wamid.xxx"\n}`}</pre>
      </div>
    </AppShell>
  );
}
