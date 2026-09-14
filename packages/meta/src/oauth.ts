import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface OAuthStatePayload {
  org: string;
  ws: string;
  product: string;
  exp: number;
  nonce: string;
}

/** CSRF-safe OAuth state: HMAC-signed, expiry-bound, tenant-scoped. Stateless — no DB row needed. */
export function signState(
  input: { org: string; ws: string; product: string; ttlSeconds?: number },
  secret: string,
): string {
  const payload: OAuthStatePayload = {
    org: input.org,
    ws: input.ws,
    product: input.product,
    exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? 600),
    nonce: randomBytes(8).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string, secret: string): OAuthStatePayload {
  const [body, sig] = state.split(".");
  if (!body || !sig) throw new Error("Malformed OAuth state");
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid OAuth state signature");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
  if (!payload.org || !payload.ws || !payload.product || typeof payload.exp !== "number") {
    throw new Error("Malformed OAuth state payload");
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired OAuth state");
  return payload;
}

export interface TokenExchangeInput {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
  version?: string;
  fetchFn?: typeof fetch;
}

export interface MetaToken {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

async function tokenRequest(url: string, fetchFn: typeof fetch): Promise<MetaToken> {
  const res = await fetchFn(url);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string };
  };
  if (!res.ok || data.error || typeof data.access_token !== "string") {
    throw new Error(data.error?.message ?? "Meta token exchange failed");
  }
  return {
    access_token: data.access_token,
    token_type: typeof data.token_type === "string" ? data.token_type : "bearer",
    expires_in: typeof data.expires_in === "number" ? data.expires_in : undefined,
  };
}

/** Exchange an authorization code for a short-lived user token. Real Graph call. */
export function exchangeCodeForToken(input: TokenExchangeInput): Promise<MetaToken> {
  const version = input.version ?? "v21.0";
  const qs = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  });
  return tokenRequest(`https://graph.facebook.com/${version}/oauth/access_token?${qs}`, input.fetchFn ?? fetch);
}

/** Exchange a short-lived token for a 60-day long-lived token. Real Graph call. */
export function exchangeForLongLivedToken(input: {
  appId: string;
  appSecret: string;
  shortLivedToken: string;
  version?: string;
  fetchFn?: typeof fetch;
}): Promise<MetaToken> {
  const version = input.version ?? "v21.0";
  const qs = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: input.appId,
    client_secret: input.appSecret,
    fb_exchange_token: input.shortLivedToken,
  });
  return tokenRequest(`https://graph.facebook.com/${version}/oauth/access_token?${qs}`, input.fetchFn ?? fetch);
}

export interface DebugTokenResult {
  isValid: boolean;
  scopes: string[];
  expiresAt?: number;
  appId?: string;
}

/** Validate a token and read granted scopes via debug_token. Requires the app token (appId|appSecret). */
export async function debugToken(input: {
  appId: string;
  appSecret: string;
  inputToken: string;
  version?: string;
  fetchFn?: typeof fetch;
}): Promise<DebugTokenResult> {
  const version = input.version ?? "v21.0";
  const qs = new URLSearchParams({
    input_token: input.inputToken,
    access_token: `${input.appId}|${input.appSecret}`,
  });
  const res = await (input.fetchFn ?? fetch)(`https://graph.facebook.com/${version}/debug_token?${qs}`);
  const data = (await res.json().catch(() => ({}))) as {
    data?: { is_valid?: boolean; scopes?: string[]; expires_at?: number; app_id?: string };
  };
  const d = data.data;
  if (!res.ok || !d) throw new Error("Meta debug_token request failed");
  return {
    isValid: d.is_valid === true,
    scopes: Array.isArray(d.scopes) ? d.scopes : [],
    expiresAt: typeof d.expires_at === "number" ? d.expires_at : undefined,
    appId: typeof d.app_id === "string" ? d.app_id : undefined,
  };
}
