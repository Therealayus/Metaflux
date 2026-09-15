"use client";

import type { ReactNode } from "react";

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="space-y-3" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" aria-hidden />
      ))}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.04] px-6 py-8 text-center">
      <p className="text-sm font-medium text-red-200">Something needs attention</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-zinc-400">{message}</p>
      {onRetry ? (
        <button onClick={onRetry} className="mt-4 h-9 rounded-lg border border-white/10 px-4 text-sm text-zinc-200 hover:bg-white/[0.05]">
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function EmptyBlock({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-100">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-zinc-400">{body}</p>
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
