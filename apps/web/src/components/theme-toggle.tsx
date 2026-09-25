"use client";

import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "sf-theme";

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function applyTheme(next: Theme) {
  const root = document.documentElement;
  root.classList.toggle("light", next === "light");
  root.classList.toggle("dark", next !== "light");
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* private mode — theme just won't persist */
  }
}

/** Futuristic theme toggle: morphing sun/moon with a circular reveal wipe. */
export function ThemeToggle({ size = 36 }: { size?: number }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function shift(e: React.MouseEvent<HTMLButtonElement>) {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const swap = () => {
      applyTheme(next);
      setTheme(next);
    };
    // Brief window where every surface cross-fades its colors.
    document.documentElement.classList.add("theme-shift");
    window.setTimeout(() => document.documentElement.classList.remove("theme-shift"), 500);

    const startViewTransition = (document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> };
    }).startViewTransition;
    if (typeof startViewTransition === "function") {
      const x = e.clientX;
      const y = e.clientY;
      const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      try {
        const transition = startViewTransition.call(document, swap);
        transition.ready
          .then(() => {
            document.documentElement.animate(
              { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
              { duration: 600, easing: "cubic-bezier(0.22,1,0.36,1)", pseudoElement: "::view-transition-new(root)" },
            );
          })
          .catch(() => undefined);
        return;
      } catch {
        /* fall through to instant swap */
      }
    }
    swap();
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={shift}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{ width: size, height: size }}
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] text-zinc-300 shadow-[0_0_18px_rgba(99,102,241,0.25)] transition hover:border-indigo-400/50 hover:text-white light:border-indigo-900/15 light:bg-white light:text-amber-500 light:shadow-[0_0_18px_rgba(99,102,241,0.35)] light:hover:text-amber-600"
    >
      <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500/25 via-transparent to-cyan-400/20" aria-hidden />
      <motion.span
        key={theme}
        initial={{ rotate: -120, scale: 0.4, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 20 }}
        className="relative"
      >
        {isDark ? <Moon size={size * 0.5} /> : <Sun size={size * 0.5} />}
      </motion.span>
    </button>
  );
}
