import { createHash } from "node:crypto";
import { requireRole } from "@socialflux/auth";
import { getStore } from "@socialflux/database";
import { logger, newRequestId } from "@socialflux/observability";
import type { TenantContext, TenantRole } from "@socialflux/types";
import type { FastifyReply, FastifyRequest } from "fastify";

export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? "socialflux_session";

export function requestId(request: FastifyRequest): string {
  const header = request.headers["x-request-id"];
  return typeof header === "string" && header.length > 0 ? header : newRequestId();
}

export function sendError(reply: FastifyReply, status: number, code: string, message: string, reqId: string, details?: unknown) {
  logger.warn({ requestId: reqId, status, code, message });
  return reply.status(status).send({ code, message, requestId: reqId, details });
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function bearerKey(request: FastifyRequest): string | undefined {
  const auth = request.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const header = request.headers["x-api-key"];
  return typeof header === "string" ? header.trim() : undefined;
}

async function resolveApiKey(request: FastifyRequest): Promise<TenantContext | undefined> {
  const raw = bearerKey(request);
  if (!raw || !raw.startsWith("mf_")) return undefined;
  const prefix = raw.split("_").slice(2).join("_").slice(0, 8);
  const store = await getStore();
  const key = await store.getApiKeyByPrefix(prefix);
  if (!key) return undefined;
  if (key.revokedAt) return undefined;
  if (key.expiresAt && key.expiresAt < new Date().toISOString()) return undefined;
  if (hashToken(raw) !== key.keyHash) return undefined;
  await store.touchApiKey(key.id).catch(() => undefined);
  const workspaceId =
    typeof request.headers["x-workspace-id"] === "string" ? request.headers["x-workspace-id"] : undefined;
  if (workspaceId) {
    const ws = await store.getWorkspace(workspaceId, key.organizationId);
    if (!ws) return undefined;
  }
  return {
    userId: `key:${key.id}`,
    organizationId: key.organizationId,
    workspaceId,
    role: "member",
    requestId: requestId(request),
    apiKeyId: key.id,
    scopes: key.scopes,
  };
}

async function resolveSession(request: FastifyRequest): Promise<TenantContext | undefined> {
  const cookies = request.cookies as Record<string, string | undefined> | undefined;
  const token = cookies?.[SESSION_COOKIE];
  if (!token) return undefined;
  const store = await getStore();
  const sess = await store.getSessionByTokenHash(hashToken(token));
  if (!sess) return undefined;
  const orgId = request.headers["x-org-id"];
  if (typeof orgId !== "string") return undefined;
  const membership = await store.getMembership(sess.user.id, orgId);
  if (!membership) return undefined;
  const workspaceId =
    typeof request.headers["x-workspace-id"] === "string" ? request.headers["x-workspace-id"] : undefined;
  if (workspaceId) {
    const ws = await store.getWorkspace(workspaceId, orgId);
    if (!ws) return undefined;
  }
  return {
    userId: sess.user.id,
    organizationId: orgId,
    workspaceId,
    role: membership.role as TenantRole,
    requestId: requestId(request),
    scopes: ["*"],
  };
}

/** Dev/test fallback. Disabled in production unless ALLOW_DEV_AUTH=1. */
function resolveDev(request: FastifyRequest): TenantContext | undefined {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_AUTH !== "1") return undefined;
  const userId = request.headers["x-user-id"];
  const orgId = request.headers["x-org-id"];
  if (typeof userId !== "string" || typeof orgId !== "string") return undefined;
  return {
    userId,
    organizationId: orgId,
    workspaceId: typeof request.headers["x-workspace-id"] === "string" ? request.headers["x-workspace-id"] : undefined,
    role: "owner",
    requestId: requestId(request),
    scopes: ["*"],
  };
}

/**
 * Tenant derivation point. Order: API key -> session cookie -> dev headers.
 * Route handlers never trust client-supplied org IDs; they use ctx.organizationId.
 */
export async function resolveTenant(request: FastifyRequest): Promise<TenantContext | undefined> {
  return (await resolveApiKey(request)) ?? (await resolveSession(request)) ?? resolveDev(request);
}

export async function requireTenant(request: FastifyRequest): Promise<TenantContext> {
  const ctx = await resolveTenant(request);
  return requireRole(ctx, "viewer");
}
