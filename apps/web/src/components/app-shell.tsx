"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Braces,
  ChartBar,
  Cpu,
  FolderKanban,
  HeartPulse,
  Home,
  Plug,
  Settings,
  Wallet,
  Boxes,
  ScrollText,
  FlaskConical,
  ShieldAlert,
} from "lucide-react";
import { FluxMark } from "./flux-mark";
import { useSession } from "@/lib/use-session";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/command", label: "AI Command", icon: Cpu },
  { href: "/connections", label: "Connections", icon: Plug },
  { href: "/assets", label: "Assets", icon: Boxes },
  { href: "/automations", label: "Automations", icon: FolderKanban },
  { href: "/workflows", label: "Workflows", icon: ScrollText },
  { href: "/events", label: "Events", icon: Activity },
  { href: "/explorer", label: "API Explorer", icon: Braces },
  { href: "/health", label: "Health", icon: HeartPulse },
  { href: "/analytics", label: "Analytics", icon: ChartBar },
  { href: "/developer", label: "Developer", icon: FlaskConical },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Billing", icon: Wallet },
  { href: "/admin", label: "Admin", icon: ShieldAlert },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { org, workspace, loading, usingDevFallback, user } = useSession();
  return (
    <div className="min-h-screen bg-ink-950 lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-white/[0.06] bg-ink-900/50 lg:block">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <FluxMark size={24} />
          <span className="text-sm font-semibold text-white">MetaFlux</span>
        </div>
        <nav className="space-y-0.5 px-3 pb-6">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={
                  active
                    ? "flex items-center gap-2.5 rounded-lg bg-indigo-500/15 px-3 py-2 text-sm font-medium text-indigo-200"
                    : "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
                }
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex h-16 items-center justify-between border-b border-white/[0.06] px-5">
          <p className="text-sm text-zinc-400">
            {loading ? (
              "Loading…"
            ) : org ? (
              <>
                {org.name} <span className="mx-1.5 text-zinc-600">/</span> <span className="text-zinc-200">{workspace?.name ?? "No workspace"}</span>
              </>
            ) : usingDevFallback ? (
              <>Dev workspace <span className="mx-1.5 text-zinc-600">/</span> <span className="text-zinc-200">local</span></>
            ) : (
              <Link href="/signin" className="hover:text-zinc-200">Sign in</Link>
            )}
          </p>
          <div className="flex items-center gap-3">
            {!loading && user ? (
              <span className="hidden text-xs text-zinc-500 sm:inline" title={user.email}>{user.name ?? user.email}</span>
            ) : null}
            <Link href="/command" className="hidden h-9 items-center rounded-lg border border-white/10 bg-white/[0.03] px-4 text-sm text-zinc-200 sm:inline-flex">
              What do you want to do?
            </Link>
          </div>
        </header>
        {/* Mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-b border-white/[0.06] px-3 py-2 lg:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/[0.05] hover:text-white">
              {n.label}
            </Link>
          ))}
        </nav>
        <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-1 text-sm text-zinc-400">{body}</p>
      </div>
      {action}
    </div>
  );
}
