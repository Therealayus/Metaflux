import { describe, expect, it } from "vitest";
import { assertSameOrg, isDestructiveAction, requireRole } from "./index.js";

describe("auth", () => {
  it("enforces roles and tenant isolation", () => {
    const ctx = { userId: "u", organizationId: "o1", role: "member" as const, requestId: "r" };
    expect(() => requireRole(ctx, "admin")).toThrow();
    expect(() => assertSameOrg(ctx, "other")).toThrow();
    expect(requireRole(ctx, "viewer").userId).toBe("u");
    expect(isDestructiveAction("disconnect whatsapp")).toBe(true);
  });
});
