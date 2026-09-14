import Link from "next/link";
import { FluxMark } from "./flux-mark";

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <FluxMark />
          <span className="text-[15px] font-semibold tracking-tight text-white">MetaFlux</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-zinc-400 lg:flex">
          <Link className="hover:text-white" href="#how">How it works</Link>
          <Link className="hover:text-white" href="#integrations">Integrations</Link>
          <Link className="hover:text-white" href="#developers">Developers</Link>
          <Link className="hover:text-white" href="#security">Security</Link>
          <Link className="hover:text-white" href="#pricing">Pricing</Link>
        </nav>
        <div className="flex items-center gap-2.5">
          <Link
            href="/signin"
            className="hidden h-9 items-center rounded-lg px-3.5 text-sm text-zinc-300 hover:text-white sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center rounded-lg border border-indigo-400/40 bg-indigo-500 px-3.5 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Start building free
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <FluxMark />
          <div>
            <p className="text-sm font-semibold text-white">MetaFlux</p>
            <p className="text-xs text-zinc-500">Meta is complicated. MetaFlux isn&apos;t.</p>
          </div>
        </div>
        <div className="flex gap-6 text-sm text-zinc-500">
          <Link href="/signin" className="hover:text-zinc-200">Sign in</Link>
          <Link href="/home" className="hover:text-zinc-200">Platform</Link>
          <Link href="#security" className="hover:text-zinc-200">Security</Link>
        </div>
      </div>
    </footer>
  );
}
