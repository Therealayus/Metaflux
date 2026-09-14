import { describe, expect, it } from "vitest";
import { assertSameOrg, isDestructiveAction, requireRole } from "./index.js";

describe("auth", () => {
  it("enforces roles and tenant isolation", () => {
    const ctx = { userId: "u", organizationId: "o1", role: "member" as const, requestId: "r", scopes: ["*"] };
    expect(() => requireRole(ctx, "admin")).toThrow();
    expect(() => assertSameOrg(ctx, "other")).toThrow();
    expect(requireRole(ctx, "viewer").userId).toBe("u");
    expect(isDestructiveAction("disconnect whatsapp")).toBe(true);
  });
});

describe("credentials", () => {
  it("hashes and verifies passwords, rejects wrong ones", async () => {
    const { hashPassword, verifyPassword, newApiKey, validateApiKeyFormat } = await import("./credentials.js");
    const hash = await hashPassword("correct-horse-1");
    expect(hash).not.toContain("correct-horse-1");
    expect(await verifyPassword("correct-horse-1", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    const { raw, prefix } = newApiKey("live");
    expect(validateApiKeyFormat(raw)).toBe(true);
    expect(raw).toContain(prefix);
    expect(validateApiKeyFormat("nope")).toBe(false);
  });
});
