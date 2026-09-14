import { requireRole } from "@metaflux/auth";
import { logger, newRequestId } from "@metaflux/observability";
import type { TenantContext } from "@metaflux/types";
import type { FastifyReply, FastifyRequest } from "fastify";

export function requestId(request: FastifyRequest): string {
  const header = request.headers["x-request-id"];
  return typeof header === "string" && header.length > 0 ? header : newRequestId();
}

export function sendError(reply: FastifyReply, status: number, code: string, message: string, reqId: string, details?: unknown) {
  logger.warn({ requestId: reqId, status, code, message });
  return reply.status(status).send({ code, message, requestId: reqId, details });
}

/**
 * Placeholder session resolver for foundation: reads tenant headers set by the
 * web app during local development. Production replaces this with signed
 * session-cookie validation — the TenantContext derivation point stays here,
 * so route handlers never trust client-supplied org IDs.
 */
export function resolveTenant(request: FastifyRequest): TenantContext | undefined {
  const userId = request.headers["x-user-id"];
  const orgId = request.headers["x-org-id"];
  if (typeof userId !== "string" || typeof orgId !== "string") return undefined;
  return {
    userId,
    organizationId: orgId,
    workspaceId: typeof request.headers["x-workspace-id"] === "string" ? request.headers["x-workspace-id"] : undefined,
    role: "owner",
    requestId: requestId(request),
  };
}

export function requireTenant(request: FastifyRequest): TenantContext {
  const ctx = resolveTenant(request);
  return requireRole(ctx, "viewer");
}
