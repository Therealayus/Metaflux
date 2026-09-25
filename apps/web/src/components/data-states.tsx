"use client";

import type { ReactNode } from "react";

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="space-y-3" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02] light:border-indigo-950/10 light:bg-white" aria-hidden />
      ))}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.04] px-6 py-8 text-center light:bg-red-500/[0.07] light:shadow-sm">
      <p className="text-sm font-medium text-red-200 light:text-red-700">Something needs attention</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-zinc-400 light:text-zinc-500">{message}</p>
      {onRetry ? (
        <button onClick={onRetry} className="mt-4 h-9 rounded-lg border border-white/10 px-4 text-sm text-zinc-200 hover:bg-white/[0.05] light:border-zinc-900/15 light:text-zinc-700 light:hover:bg-zinc-900/[0.05]">
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function EmptyBlock({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 px-6 py-12 text-center light:border-indigo-950/20 light:bg-white/60">
      <p className="text-sm font-medium text-zinc-100 light:text-zinc-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-zinc-400 light:text-zinc-500">{body}</p>
      {action ? <div className="mt-5 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
