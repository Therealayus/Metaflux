import { AppShell, PageHeader } from "@/components/app-shell";

export default function DeveloperPage() {
  return (
    <AppShell>
      <PageHeader title="Developer console" body="API keys (hashed), webhook endpoints, logs, environments and replay." action={<button className="h-9 rounded-lg bg-indigo-500 px-4 text-sm font-medium text-white">New API key</button>} />
      <pre className="overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-xs text-zinc-300">{`mf_live_…9f2a   production   •••• created Aug 12\nmf_test_…41bc   sandbox      •••• created Jul 30`}</pre>
    </AppShell>
  );
}
