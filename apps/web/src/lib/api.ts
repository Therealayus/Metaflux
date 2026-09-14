/** Typed API fetch for the app shell. Dev stand-in headers until session auth lands (Phase 5). */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function devHeaders(): Record<string, string> {
  if (typeof window !== "undefined") {
    return {
      "x-user-id": window.localStorage.getItem("mf.user") ?? "dev-user",
      "x-org-id": window.localStorage.getItem("mf.org") ?? "dev-org",
      ...(window.localStorage.getItem("mf.ws") ? { "x-workspace-id": window.localStorage.getItem("mf.ws") as string } : {}),
    };
  }
  return {};
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

export async function api<T>(path: string, init?: RequestInit & { confirm?: boolean }): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...devHeaders(),
      ...(init?.confirm ? { "x-confirm": "true" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; message?: string; code?: string };
  if (!res.ok) throw new ApiError(res.status, body.code, body.message ?? `Request failed (${res.status})`);
  return body.data as T;
}
