import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#0A0A0C", 900: "#101014", 800: "#17171D" },
        accent: { 400: "#818CF8", 500: "#6366F1", 600: "#4F46E5" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [
    // `light:` variant — mirrors the built-in `dark:` class strategy
    // (`.dark .dark\:x`), so overrides beat the dark-first base utilities.
    // NOTE: do NOT wrap in :where() — that zeroes specificity and the
    // base styles win every time (that's why light mode silently failed).
    plugin(({ addVariant }) => {
      addVariant("light", ".light &");
    }),
  ],
} satisfies Config;
