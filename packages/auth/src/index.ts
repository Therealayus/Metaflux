import type { TenantContext, TenantRole } from "@metaflux/types";

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

export function isDestructiveAction(action: string): boolean {
  return /delete|disconnect|revoke|remove|destroy/i.test(action);
}
