"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, clearSession, setSession, setWorkspace, storedOrgId } from "./api";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export interface SessionOrg {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface SessionWorkspace {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
}

interface SessionState {
  user: SessionUser | null;
  orgs: SessionOrg[];
  org: SessionOrg | null;
  workspaces: SessionWorkspace[];
  workspace: SessionWorkspace | null;
  loading: boolean;
  error: string | null;
  usingDevFallback: boolean;
}

let cache: { me: unknown; workspaces: unknown } | null = null;

async function loadAll(): Promise<{ me: { user: SessionUser; organizations: SessionOrg[] }; workspaces: SessionWorkspace[] }> {
  if (!cache) {
    // Sequential: /me pins the org (cookie session) before workspace scoping.
    const me = await api<{ user: SessionUser; organizations: SessionOrg[] }>("/api/v1/auth/me");
    const workspaces = await api<SessionWorkspace[]>("/api/v1/workspaces").catch(() => [] as SessionWorkspace[]);
    cache = { me, workspaces };
  }
  return cache as { me: { user: SessionUser; organizations: SessionOrg[] }; workspaces: SessionWorkspace[] };
}

export function clearSessionCache(): void {
  cache = null;
}

/**
 * Session state for the app shell. Falls back to dev identity when the API
 * has no session (local development without sign-in).
 */
export function useSession(): SessionState & {
  switchOrg: (orgId: string) => void;
  switchWorkspace: (workspaceId: string) => void;
  signOut: () => Promise<void>;
} {
  const [state, setState] = useState<SessionState>({
    user: null,
    orgs: [],
    org: null,
    workspaces: [],
    workspace: null,
    loading: true,
    error: null,
    usingDevFallback: false,
  });

  useEffect(() => {
    let cancelled = false;
    loadAll()
      .then(({ me, workspaces }) => {
        if (cancelled) return;
        const preferred = storedOrgId();
        const org = me.organizations.find((o) => o.id === preferred) ?? me.organizations[0] ?? null;
        const orgWorkspaces = org ? workspaces.filter((w) => w.organizationId === org.id) : [];
        const storedWs = typeof window !== "undefined" ? window.localStorage.getItem("mf.ws") : null;
        const workspace = orgWorkspaces.find((w) => w.id === storedWs) ?? orgWorkspaces[0] ?? null;
        if (org && typeof window !== "undefined") {
          // Keep stored org in sync so API scoping matches the session.
          setSession(org.id, me.user.id, workspace?.id);
        }
        setState({
          user: me.user,
          orgs: me.organizations,
          org,
          workspaces: orgWorkspaces,
          workspace,
          loading: false,
          error: null,
          usingDevFallback: false,
        });
      })
      .catch((e: ApiError) => {
        if (cancelled) return;
        // No session: dev fallback keeps local development usable without sign-in.
        setState((s) => ({ ...s, loading: false, error: null, usingDevFallback: e.status === 401 }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const switchOrg = useCallback((orgId: string) => {
    clearSessionCache();
    if (typeof window !== "undefined") {
      window.localStorage.setItem("mf.org", orgId);
      window.localStorage.removeItem("mf.ws");
      window.location.reload();
    }
  }, []);

  const switchWorkspace = useCallback((workspaceId: string) => {
    setWorkspace(workspaceId);
    window.location.reload();
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api("/api/v1/auth/signout", { method: "POST" });
    } finally {
      clearSession();
      clearSessionCache();
      window.location.href = "/signin";
    }
  }, []);

  return { ...state, switchOrg, switchWorkspace, signOut };
}
