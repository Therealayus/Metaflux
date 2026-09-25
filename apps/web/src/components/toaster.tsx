"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useState } from "react";

export type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

type Listener = (items: Toast[]) => void;

let seq = 1;
let items: Toast[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l([...items]);
}

function push(tone: ToastTone, title: string, body?: string, ttlMs = 4200) {
  const id = seq++;
  items = [...items.slice(-3), { id, tone, title, body }];
  emit();
  window.setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, ttlMs);
}

/** Imperative toasts — no provider needed, just mount <Toaster/> once. */
export const toast = {
  success: (title: string, body?: string) => push("success", title, body),
  error: (title: string, body?: string) => push("error", title, body),
  info: (title: string, body?: string) => push("info", title, body),
};

const TONE_STYLE: Record<ToastTone, { icon: typeof Info; bar: string; text: string }> = {
  success: { icon: CheckCircle2, bar: "bg-emerald-400", text: "text-emerald-300 light:text-emerald-700" },
  error: { icon: AlertTriangle, bar: "bg-red-400", text: "text-red-300 light:text-red-600" },
  info: { icon: Info, bar: "bg-indigo-400", text: "text-indigo-200 light:text-indigo-700" },
};

export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);

  useEffect(() => {
    const l: Listener = (next) => setList(next);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(360px,calc(100vw-40px))] flex-col gap-2">
      <AnimatePresence>
        {list.map((t) => {
          const s = TONE_STYLE[t.tone];
          const Icon = s.icon;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 48, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="pointer-events-auto flex items-start gap-3 overflow-hidden rounded-xl border border-white/10 bg-ink-900/95 py-3 pl-3 pr-2 shadow-2xl shadow-black/50 backdrop-blur light:border-indigo-950/15 light:bg-white/95 light:shadow-[0_16px_50px_-16px_rgba(79,70,229,0.4)]"
            >
              <span className={`mt-0.5 h-8 w-1 shrink-0 rounded-full ${s.bar}`} aria-hidden />
              <Icon className={`mt-1 h-4 w-4 shrink-0 ${s.text}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-snug text-zinc-100 light:text-zinc-900">{t.title}</p>
                {t.body ? <p className="mt-0.5 truncate text-xs text-zinc-400 light:text-zinc-500" title={t.body}>{t.body}</p> : null}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => {
                  items = items.filter((x) => x.id !== t.id);
                  emit();
                }}
                className="rounded-md p-1.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200 light:hover:bg-zinc-900/5 light:hover:text-zinc-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
