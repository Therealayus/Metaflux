export interface MetaApiRequestOptions {
  method: "GET" | "POST" | "DELETE";
  path: string;
  accessToken: string;
  params?: Record<string, string | number | boolean>;
  body?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface MetaApiResponse<T = unknown> {
  data: T;
  status: number;
  latencyMs: number;
}

/**
 * Thin Meta Graph API client boundary.
 * All Meta HTTP goes through here so versioning, timeouts, and observability stay centralized.
 * NOTE: performs real HTTPS calls — no mocks. Failures surface as errors for the caller to normalize.
 */
export class MetaApiClient {
  constructor(
    private version: string,
    private fetchFn: typeof fetch = fetch,
  ) {}

  private url(path: string, params?: MetaApiRequestOptions["params"]): string {
    const clean = path.startsWith("/") ? path : `/${path}`;
    const qs = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))).toString()}` : "";
    return `https://graph.facebook.com/${this.version}${clean}${qs}`;
  }

  async request<T>(opts: MetaApiRequestOptions): Promise<MetaApiResponse<T>> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
    try {
      const res = await this.fetchFn(this.url(opts.path, opts.method === "GET" ? opts.params : undefined), {
        method: opts.method,
        headers: {
          Authorization: `Bearer ${opts.accessToken}`,
          "Content-Type": "application/json",
        },
        body: opts.method === "GET" ? undefined : JSON.stringify(opts.body ?? opts.params ?? {}),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as T;
      if (!res.ok) {
        const err = data as Record<string, unknown>;
        const metaErr = (err.error as Record<string, unknown> | undefined) ?? err;
        throw Object.assign(new Error(String(metaErr.message ?? `Meta API error ${res.status}`)), {
          raw: metaErr,
          status: res.status,
        });
      }
      return { data, status: res.status, latencyMs: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface OAuthStartInput {
  appId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
}

export function buildOAuthUrl(input: OAuthStartInput, version = "v21.0"): string {
  const qs = new URLSearchParams({
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    scope: input.scopes.join(","),
    state: input.state,
    response_type: "code",
  });
  return `https://www.facebook.com/${version}/dialog/oauth?${qs.toString()}`;
}
