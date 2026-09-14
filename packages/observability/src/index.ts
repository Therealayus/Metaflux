import pino from "pino";

export interface LogContext {
  requestId?: string;
  traceId?: string;
  organizationId?: string;
  workspaceId?: string;
  userId?: string;
  provider?: string;
  operation?: string;
}

const SENSITIVE_KEYS = new Set([
  "access_token",
  "accessToken",
  "refresh_token",
  "refreshToken",
  "client_secret",
  "clientSecret",
  "authorization",
  "api_key",
  "apiKey",
  "webhook_secret",
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k) ? "[REDACTED]" : redact(v);
    }
    return out;
  }
  return value;
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "metaflux" },
  formatters: {
    log(obj) {
      return redact(obj) as Record<string, unknown>;
    },
  },
});

export function childLogger(ctx: LogContext) {
  return logger.child(redact(ctx) as Record<string, unknown>);
}

export function newRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
