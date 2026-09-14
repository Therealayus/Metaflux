import { AppShell, PageHeader } from "@/components/app-shell";

export default function AssetsPage() {
  return (
    <AppShell>
      <PageHeader title="Asset graph" body="Business → Pages → Instagram · WABA → phone numbers. Missing assets are stated honestly." />
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 font-mono text-[13px] leading-loose text-zinc-300">
        <p>Business: Acme Corp</p>
        <p className="pl-4">├── Facebook Page: Acme <span className="text-emerald-300">●</span></p>
        <p className="pl-8">└── Instagram Business: @acme <span className="text-emerald-300">●</span></p>
        <p className="pl-4">├── WhatsApp Business Account <span className="text-emerald-300">●</span></p>
        <p className="pl-8">└── Phone: +1 555 010 2030 <span className="text-emerald-300">●</span></p>
        <p className="pl-4 text-amber-300">└── Ad Account: missing — connect to unlock ads features</p>
      </div>
    </AppShell>
  );
}
