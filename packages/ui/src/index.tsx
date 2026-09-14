import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function cn(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// --- Button ---
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-indigo-500 text-white hover:bg-indigo-400 border border-indigo-400/40",
  secondary: "bg-white/5 text-zinc-100 hover:bg-white/10 border border-white/10",
  ghost: "bg-transparent text-zinc-300 hover:text-white hover:bg-white/5 border border-transparent",
  danger: "bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/30",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-sm",
};

export function Button({ variant = "primary", size = "md", className, ...rest }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60",
        "disabled:opacity-50 disabled:pointer-events-none",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    />
  );
}

// --- Input ---
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, className, id, ...rest }: InputProps) {
  const inputId = id ?? rest.name;
  return (
    <label className="block" htmlFor={inputId}>
      {label ? <span className="mb-1.5 block text-xs font-medium text-zinc-300">{label}</span> : null}
      <input
        id={inputId}
        className={cn(
          "h-10 w-full rounded-lg border bg-white/[0.03] px-3 text-sm text-zinc-100 placeholder:text-zinc-500",
          error ? "border-red-500/50" : "border-white/10 focus:border-indigo-400/60",
          "focus:outline-none focus:ring-2 focus:ring-indigo-400/20",
          className,
        )}
        {...rest}
      />
      {error ? (
        <span className="mt-1 block text-xs text-red-300">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-zinc-500">{hint}</span>
      ) : null}
    </label>
  );
}

// --- Card ---
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-white/[0.02]", className)}>{children}</div>
  );
}

// --- Status indicator ---
type StatusTone = "ok" | "warn" | "bad" | "idle";

const toneDot: Record<StatusTone, string> = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  bad: "bg-red-400",
  idle: "bg-zinc-500",
};

export function StatusDot({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-zinc-300">
      <span className={cn("h-2 w-2 rounded-full", toneDot[tone])} aria-hidden />
      {label}
    </span>
  );
}

// --- Empty / Error states ---
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-100">{title}</p>
      <p className="max-w-sm text-sm text-zinc-400">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-500/25 bg-red-500/[0.04] px-6 py-12 text-center">
      <p className="text-sm font-medium text-red-200">{title}</p>
      <p className="max-w-sm text-sm text-zinc-400">{body}</p>
      {action}
    </div>
  );
}

// --- Skeleton ---
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-white/[0.06]", className)} aria-hidden />;
}

// --- Permission card / Connection card / Health card ---
export function PermissionCard({
  name,
  status,
  why,
}: {
  name: string;
  status: "granted" | "missing";
  why: string;
}) {
  const granted = status === "granted";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-100">{name}</p>
        <StatusDot tone={granted ? "ok" : "warn"} label={granted ? "Available" : "Required"} />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">{why}</p>
    </div>
  );
}

export function ConnectionCard({
  product,
  status,
  detail,
  action,
}: {
  product: string;
  status: StatusTone;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium capitalize text-zinc-100">{product}</p>
        <StatusDot tone={status} label={status === "ok" ? "Connected" : status === "warn" ? "Attention" : "State"} />
      </div>
      <p className="mt-2 text-xs text-zinc-400">{detail}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

// --- AI action confirmation ---
export function AIActionConfirm({
  title,
  body,
  impact,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  impact: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div role="alertdialog" aria-modal="true" aria-label={title} className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] p-5">
      <p className="text-sm font-semibold text-amber-200">{title}</p>
      <p className="mt-2 text-sm text-zinc-200">{body}</p>
      <p className="mt-1 text-xs text-zinc-400">{impact}</p>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" onClick={onConfirm}>
          Confirm
        </Button>
      </div>
    </div>
  );
}

// --- Code / JSON viewer ---
export function CodeViewer({ code, language = "json" }: { code: string; language?: string }) {
  return (
    <pre className="overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs leading-relaxed text-zinc-200">
      <code data-language={language}>{code}</code>
    </pre>
  );
}
