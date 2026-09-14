"use client";

import Link from "next/link";
import { useState } from "react";
import { FluxMark } from "@/components/flux-mark";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

async function post(path: string, body: unknown): Promise<{ ok: boolean; message?: string; data?: { devToken?: string } }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; data?: { devToken?: string } };
  return { ok: res.ok, message: data.message, data: data.data };
}

export function AuthForm({ mode }: { mode: "signin" | "signup" | "reset" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
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
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const r = await post("/api/v1/auth/signup", { email, password, name: name || undefined });
        if (!r.ok) throw new Error(r.message ?? "Sign up failed");
        window.location.href = "/home";
      } else if (mode === "signin") {
        const r = await post("/api/v1/auth/signin", { email, password });
        if (!r.ok) throw new Error(r.message ?? "Sign in failed");
        window.location.href = "/home";
      } else {
        const r = await post("/api/v1/auth/password-reset/request", { email });
        if (!r.ok) throw new Error(r.message ?? "Request failed");
        setNotice(
          r.data?.devToken
            ? `Dev build: reset token ${r.data.devToken} (redeem via the API; email delivery is configured per deployment).`
            : "If that email exists, a reset link is on its way.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "github") {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/${provider}/start`, { credentials: "include" });
      const data = (await res.json()) as { data?: { url?: string }; message?: string };
      if (!res.ok || !data.data?.url) throw new Error(data.message ?? `${provider} sign-in is not configured on this instance`);
      window.location.href = data.data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "OAuth failed");
    }
  }

  return (
    <Shell
      title={mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your workspace" : "Reset password"}
      subtitle="Secure httpOnly session cookies. Rate-limited and brute-force protected."
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        {mode === "signup" ? (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-300">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-400/60 focus:outline-none"
            />
          </label>
        ) : null}
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
        {notice ? <p className="text-xs text-emerald-300">{notice}</p> : null}
        <button type="submit" disabled={busy} className="h-10 w-full rounded-lg bg-indigo-500 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-60">
          {busy ? "Working…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </button>
      </form>
      {mode !== "reset" ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={() => void oauth("google")} className="h-10 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-zinc-200 hover:bg-white/[0.06]">Google</button>
          <button onClick={() => void oauth("github")} className="h-10 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-zinc-200 hover:bg-white/[0.06]">GitHub</button>
        </div>
      ) : null}
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
