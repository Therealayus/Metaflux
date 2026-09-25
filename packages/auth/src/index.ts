import type { TenantContext, TenantRole } from "@socialflux/types";

const ROLE_RANK: Record<TenantRole, number> = { owner: 3, admin: 2, member: 1, viewer: 0 };

/** Server-side authorization. The frontend never decides access. */
export function requireRole(ctx: TenantContext | undefined, minimum: TenantRole): TenantContext {
  if (!ctx) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  if (ROLE_RANK[ctx.role] < ROLE_RANK[minimum]) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  return ctx;
}

/** Enforces tenant isolation: every tenant-scoped row must match the session org. */
export function assertSameOrg(ctx: TenantContext, rowOrganizationId: string): void {
  if (rowOrganizationId !== ctx.organizationId) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
}

/** API-key scope check. Sessions carry "*" and bypass fine-grained scopes. */
export function requireScope(ctx: TenantContext, scope: string): TenantContext {
  if (ctx.scopes.includes("*") || ctx.scopes.includes(scope)) return ctx;
  throw Object.assign(new Error(`Missing required scope: ${scope}`), { status: 403, code: "insufficient_scope" });
}

/** Key management (create/revoke) requires a human session, never another API key. */
export function requireSession(ctx: TenantContext): TenantContext {
  if (ctx.apiKeyId) throw Object.assign(new Error("This action requires user sign-in"), { status: 403 });
  return ctx;
}

export * from "./credentials.js";

export function isDestructiveAction(action: string): boolean {
  return /delete|disconnect|revoke|remove|destroy/i.test(action);
}
