import type { MetaApiClient } from "./client.js";
import { debugToken } from "./oauth.js";

export type TokenState = "healthy" | "expiring_soon" | "expired" | "invalid" | "unknown";
export type HealthState = "healthy" | "action_required" | "disconnected" | "unknown";

export interface ConnectionHealthReport {
  token: TokenState;
  tokenExpiresAt?: string;
  grantedScopes: string[];
  missingScopes: string[];
  webhook: "healthy" | "inactive" | "unknown";
  api: "healthy" | "failing" | "unknown";
  lastEventAt?: string;
  checkedAt: string;
  state: HealthState;
}

export interface HealthCheckInput {
  accessToken: string;
  appId?: string;
  appSecret?: string;
  requiredScopes: string[];
  webhookStatus?: string;
  lastEventAt?: string;
  version?: string;
  fetchFn?: typeof fetch;
}

const EXPIRING_SOON_SECONDS = 7 * 24 * 3600;

/**
 * Real health check: validates the token (debug_token when app credentials exist,
 * otherwise a lightweight /me probe), diffs granted vs required scopes.
 * Never fabricates — unknown stays unknown.
 */
export async function checkConnectionHealth(
  client: MetaApiClient,
  input: HealthCheckInput,
): Promise<ConnectionHealthReport> {
  const checkedAt = new Date().toISOString();
  let token: TokenState = "unknown";
  let grantedScopes: string[] = [];
  let tokenExpiresAt: string | undefined;
  let api: ConnectionHealthReport["api"] = "unknown";

  try {
    if (input.appId && input.appSecret) {
      const dbg = await debugToken({
        appId: input.appId,
        appSecret: input.appSecret,
        inputToken: input.accessToken,
        version: input.version,
        fetchFn: input.fetchFn,
      });
      api = "healthy";
      if (!dbg.isValid) {
        token = "invalid";
      } else {
        grantedScopes = dbg.scopes;
        if (dbg.expiresAt) {
          tokenExpiresAt = new Date(dbg.expiresAt * 1000).toISOString();
          const secondsLeft = dbg.expiresAt - Math.floor(Date.now() / 1000);
          token = secondsLeft <= 0 ? "expired" : secondsLeft < EXPIRING_SOON_SECONDS ? "expiring_soon" : "healthy";
        } else {
          token = "healthy";
        }
      }
    } else {
      // No app credentials configured: prove the token works with /me, scopes stay unknown.
      await client.request({ method: "GET", path: "/me", accessToken: input.accessToken, params: { fields: "id" } });
      api = "healthy";
      token = "healthy";
    }
  } catch {
    api = "failing";
    token = "unknown";
  }

  const missingScopes = input.requiredScopes.filter((s) => !grantedScopes.includes(s));
  const webhook: ConnectionHealthReport["webhook"] =
    input.webhookStatus === "active" ? "healthy" : input.webhookStatus === "inactive" ? "inactive" : "unknown";

  const state: HealthState =
    token === "invalid" || token === "expired" || (input.requiredScopes.length > 0 && grantedScopes.length > 0 && missingScopes.length > 0) || webhook === "inactive"
      ? "action_required"
      : api === "failing"
        ? "unknown"
        : "healthy";

  return {
    token,
    tokenExpiresAt,
    grantedScopes,
    missingScopes,
    webhook,
    api,
    lastEventAt: input.lastEventAt,
    checkedAt,
    state,
  };
}
