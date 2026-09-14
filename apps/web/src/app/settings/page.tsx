import { AppShell, PageHeader } from "@/components/app-shell";

export default function SettingsPage() {
  return (
    <AppShell>
      <PageHeader title="Settings" body="Organization, workspaces, roles, sessions and audit trail." />
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-300">
        <p>Organization: Acme Corp · Role: Owner</p>
        <p className="mt-1 text-zinc-500">Workspaces: Production, Staging · Members: 8 · Sessions: 3 devices</p>
      </div>
    </AppShell>
  );
}
