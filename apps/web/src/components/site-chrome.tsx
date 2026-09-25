import Link from "next/link";
import { FluxMark } from "./flux-mark";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur light:border-indigo-950/10 light:bg-white/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <FluxMark />
          <span className="text-[15px] font-semibold tracking-tight text-white light:text-zinc-900">SocialFlux</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-zinc-400 light:text-zinc-500 lg:flex">
          <Link className="hover:text-white light:hover:text-zinc-900" href="#how">How it works</Link>
          <Link className="hover:text-white light:hover:text-zinc-900" href="#integrations">Integrations</Link>
          <Link className="hover:text-white light:hover:text-zinc-900" href="#developers">Developers</Link>
          <Link className="hover:text-white light:hover:text-zinc-900" href="#security">Security</Link>
          <Link className="hover:text-white light:hover:text-zinc-900" href="#pricing">Pricing</Link>
        </nav>
        <div className="flex items-center gap-2.5">
          <ThemeToggle size={34} />
          <Link
            href="/signin"
            className="hidden h-9 items-center rounded-lg px-3.5 text-sm text-zinc-300 hover:text-white light:text-zinc-600 light:hover:text-zinc-900 sm:inline-flex"
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
    <footer className="border-t border-white/[0.06] py-10 light:border-indigo-950/10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <FluxMark />
          <div>
            <p className="text-sm font-semibold text-white light:text-zinc-900">SocialFlux</p>
            <p className="text-xs text-zinc-500">Meta is complicated. SocialFlux isn&apos;t.</p>
          </div>
        </div>
        <div className="flex gap-6 text-sm text-zinc-500">
          <Link href="/signin" className="hover:text-zinc-200 light:hover:text-zinc-900">Sign in</Link>
          <Link href="/home" className="hover:text-zinc-200 light:hover:text-zinc-900">Platform</Link>
          <Link href="#security" className="hover:text-zinc-200 light:hover:text-zinc-900">Security</Link>
        </div>
      </div>
    </footer>
  );
}
