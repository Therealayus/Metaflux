"use client";

import Link from "next/link";
import { useState } from "react";
import { FluxMark } from "@/components/flux-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { API_URL, setSession } from "@/lib/api";
import { clearSessionCache } from "@/lib/use-session";

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-5 py-12 light:bg-[#ECEEF7]">
      <div className="fixed right-5 top-5">
        <ThemeToggle size={34} />
      </div>
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center gap-2.5">
          <FluxMark />
          <span className="text-sm font-semibold text-white light:text-zinc-900">SocialFlux</span>
        </Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-white light:text-zinc-900">{title}</h1>
        <p className="mt-2 text-sm text-zinc-400 light:text-zinc-500">{subtitle}</p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6 light:border-indigo-950/10 light:bg-white light:shadow-[0_20px_60px_-20px_rgba(79,70,229,0.25)]">{children}</div>
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

/** After cookie auth succeeds, pin the org/user so API scoping matches the session. */
async function persistSession(): Promise<void> {
  clearSessionCache();
  const res = await fetch(`${API_URL}/api/v1/auth/me`, { credentials: "include" });
  if (!res.ok) return;
  const body = (await res.json()) as {
    data?: { user?: { id?: string }; organizations?: Array<{ id?: string }> };
  };
  const userId = body.data?.user?.id;
  const orgId = body.data?.organizations?.[0]?.id;
  if (userId && orgId) setSession(orgId, userId);
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
        await persistSession();
        window.location.href = "/home";
      } else if (mode === "signin") {
        const r = await post("/api/v1/auth/signin", { email, password });
        if (!r.ok) throw new Error(r.message ?? "Sign in failed");
        await persistSession();
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
            <span className="mb-1.5 block text-xs font-medium text-zinc-300 light:text-zinc-600">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-400/60 focus:outline-none light:border-indigo-950/15 light:bg-white light:text-zinc-900 light:placeholder:text-zinc-400 light:shadow-sm"
            />
          </label>
        ) : null}
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-300 light:text-zinc-600">Work email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-400/60 focus:outline-none light:border-indigo-950/15 light:bg-white light:text-zinc-900 light:placeholder:text-zinc-400 light:shadow-sm"
          />
        </label>
        {mode !== "reset" ? (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-300 light:text-zinc-600">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-400/60 focus:outline-none light:border-indigo-950/15 light:bg-white light:text-zinc-900 light:placeholder:text-zinc-400 light:shadow-sm"
            />
          </label>
        ) : null}
        {error ? <p className="text-xs text-red-300 light:text-red-600">{error}</p> : null}
        {notice ? <p className="text-xs text-emerald-300 light:text-emerald-700">{notice}</p> : null}
        <button type="submit" disabled={busy} className="h-10 w-full rounded-lg bg-indigo-500 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-60">
          {busy ? "Working…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </button>
      </form>
      {mode !== "reset" ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={() => void oauth("google")} className="h-10 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-zinc-200 hover:bg-white/[0.06] light:border-indigo-950/15 light:bg-white light:text-zinc-700 light:shadow-sm light:hover:bg-zinc-50">Google</button>
          <button onClick={() => void oauth("github")} className="h-10 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-zinc-200 hover:bg-white/[0.06] light:border-indigo-950/15 light:bg-white light:text-zinc-700 light:shadow-sm light:hover:bg-zinc-50">GitHub</button>
        </div>
      ) : null}
      <div className="mt-5 flex justify-between text-xs text-zinc-500">
        {mode === "signin" ? (
          <>
            <Link href="/signup" className="hover:text-zinc-200 light:hover:text-zinc-900">New here? Sign up</Link>
            <Link href="/reset" className="hover:text-zinc-200 light:hover:text-zinc-900">Forgot password?</Link>
          </>
        ) : mode === "signup" ? (
          <Link href="/signin" className="hover:text-zinc-200 light:hover:text-zinc-900">Have an account? Sign in</Link>
        ) : (
          <Link href="/signin" className="hover:text-zinc-200 light:hover:text-zinc-900">Back to sign in</Link>
        )}
      </div>
    </Shell>
  );
}
