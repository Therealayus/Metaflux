"use client";

import Link from "next/link";
import { useState } from "react";
import { FluxMark } from "@/components/flux-mark";

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-5 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center gap-2.5">
          <FluxMark />
          <span className="text-sm font-semibold text-white">MetaFlux</span>
        </Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-2 text-sm text-zinc-400">{subtitle}</p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6">{children}</div>
      </div>
    </div>
  );
}

export function AuthForm({ mode }: { mode: "signin" | "signup" | "reset" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (mode !== "reset" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError(null);
    // Foundation: auth UI only — real session endpoints land with the auth service.
    window.location.href = "/home";
  }

  return (
    <Shell
      title={mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your workspace" : "Reset password"}
      subtitle="Secure session cookies. MFA-ready. Rate-limited and brute-force protected."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-300">Work email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-400/60 focus:outline-none"
          />
        </label>
        {mode !== "reset" ? (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-300">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-400/60 focus:outline-none"
            />
          </label>
        ) : null}
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <button type="submit" className="h-10 w-full rounded-lg bg-indigo-500 text-sm font-medium text-white hover:bg-indigo-400">
          {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </button>
      </form>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="h-10 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-zinc-200 hover:bg-white/[0.06]">Google</button>
        <button className="h-10 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-zinc-200 hover:bg-white/[0.06]">GitHub</button>
      </div>
      <div className="mt-5 flex justify-between text-xs text-zinc-500">
        {mode === "signin" ? (
          <>
            <Link href="/signup" className="hover:text-zinc-200">New here? Sign up</Link>
            <Link href="/reset" className="hover:text-zinc-200">Forgot password?</Link>
          </>
        ) : mode === "signup" ? (
          <Link href="/signin" className="hover:text-zinc-200">Have an account? Sign in</Link>
        ) : (
          <Link href="/signin" className="hover:text-zinc-200">Back to sign in</Link>
        )}
      </div>
    </Shell>
  );
}
