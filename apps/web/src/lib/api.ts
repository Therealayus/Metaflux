const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const ORG_KEY = "mf.org";
const USER_KEY = "mf.user";
const WS_KEY = "mf.ws";

function stored(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

function headers(): Record<string, string> {
  if (typeof window === "undefined") return {};
  // Session cookie (credentials:include below) takes precedence on the API;
  // these headers select org/workspace and are the dev fallback.
  return tenantHeaders();
}

/** Org/workspace selector headers. The API requires x-org-id alongside the
 *  session cookie, so raw fetch() callers must include these too. */
export function tenantHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const out: Record<string, string> = {
    "x-org-id": stored(ORG_KEY, "dev-org"),
    "x-user-id": stored(USER_KEY, "dev-user"),
  };
  const ws = typeof window !== "undefined" ? window.localStorage.getItem(WS_KEY) : null;
  if (ws) out["x-workspace-id"] = ws;
  return out;
}

export function setSession(organizationId: string, userId: string, workspaceId?: string): void {
  window.localStorage.setItem(ORG_KEY, organizationId);
  window.localStorage.setItem(USER_KEY, userId);
  if (workspaceId) window.localStorage.setItem(WS_KEY, workspaceId);
  else window.localStorage.removeItem(WS_KEY);
}

export function setWorkspace(workspaceId: string): void {
  window.localStorage.setItem(WS_KEY, workspaceId);
}

export function clearSession(): void {
  window.localStorage.removeItem(ORG_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(WS_KEY);
}

export function storedOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ORG_KEY);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Paginated list envelope returned by collection endpoints. */
export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export async function api<T>(path: string, init?: RequestInit & { confirm?: boolean }): Promise<T> {
  const hasBody = init?.body !== undefined;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      // Only declare JSON when a body is actually sent: Fastify rejects
      // bodyless requests that claim application/json (FST_ERR_CTP_EMPTY_JSON_BODY),
      // which broke endpoints like POST .../discover.
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...headers(),
      ...(init?.confirm ? { "x-confirm": "true" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; message?: string; code?: string };
  if (!res.ok) throw new ApiError(res.status, body.code, body.message ?? `Request failed (${res.status})`);
  return body.data as T;
}

export { API_URL };
