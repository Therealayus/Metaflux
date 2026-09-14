"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";

const STAGES = [
  "Understanding request…",
  "Instagram comments",
  "Instagram messaging",
  "WhatsApp messaging",
  "Lead creation",
];

export function CommandDemo() {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [visible, setVisible] = useState(0);

  function run() {
    if (running) return;
    setRunning(true);
    setDone(false);
    setVisible(0);
    STAGES.forEach((_, i) => {
      setTimeout(() => setVisible(i + 1), 450 * (i + 1));
    });
    setTimeout(() => {
      setRunning(false);
      setDone(true);
    }, 450 * STAGES.length + 400);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-900/80 shadow-2xl shadow-indigo-950/40 backdrop-blur">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-indigo-500/70" />
        <span className="ml-2 text-xs text-zinc-500">metaflux — build with ai</span>
      </div>
      <div className="p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">What do you want Meta to do?</p>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-100">
          “When someone comments <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 font-mono text-indigo-300">BUY</span> on
          my Instagram post, send them a WhatsApp message and create a lead.”
        </p>
        <div className="mt-5 flex justify-end">
          <button
            onClick={run}
            disabled={running}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-500 px-4 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {running ? "Planning…" : done ? "Run again" : "Build workflow"}
          </button>
        </div>
        <div className="mt-5 min-h-[190px] rounded-xl border border-white/[0.07] bg-black/40 p-4 font-mono text-[13px]" aria-live="polite">
          {visible === 0 && !done ? (
            <p className="text-zinc-600">Your plan will appear here…</p>
          ) : (
            <ul className="space-y-2">
              {STAGES.slice(0, visible).map((s, i) => (
                <motion.li
                  key={s}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={i === 0 ? "text-zinc-400" : "text-zinc-200"}
                >
                  <span className="mr-2 inline-flex items-center text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                  {s}
                </motion.li>
              ))}
            </ul>
          )}
          {done ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 border-t border-white/[0.07] pt-3 text-zinc-400">
              <p>Permissions required: <span className="text-zinc-100">4</span></p>
              <p className="mt-1">Assets: Instagram Business ✓ · Facebook Page ✓ · WhatsApp Business ✓</p>
              <p className="mt-2 inline-flex items-center gap-1 text-emerald-300">
                Ready to configure <ArrowRight className="h-3.5 w-3.5" />
              </p>
            </motion.div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
