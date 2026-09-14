import { describe, expect, it } from "vitest";
import { buildAssetGraph } from "./assets.js";
import { CapabilityRegistry, DEFAULT_CAPABILITIES, MetaApiVersionRegistry } from "./capabilities.js";
import { normalizeMetaError } from "./errors.js";
import { PermissionRegistry, DEFAULT_PERMISSIONS, evaluatePermissions } from "./permissions.js";
import { verifyWebhookSignature } from "./webhooks.js";
import { createHmac } from "node:crypto";

describe("capabilities", () => {
  it("resolves instagram messaging requirements without hard-coding elsewhere", () => {
    const reg = new CapabilityRegistry(DEFAULT_CAPABILITIES);
    const cap = reg.get("instagram", "messaging");
    expect(cap?.requiredPermissions).toContain("instagram_manage_messages");
    expect(cap?.reviewRequired).toBe(true);
  });

  it("centralizes api versions", () => {
    const reg = MetaApiVersionRegistry.fromEnv("v21.0");
    expect(reg.graphUrl("/me")).toBe("https://graph.facebook.com/v21.0/me");
    expect(() => reg.assertSupported("v99.0")).toThrow();
  });
});

describe("permissions", () => {
  it("evaluates granted vs missing with human explanations", () => {
    const reg = new PermissionRegistry(DEFAULT_PERMISSIONS);
    const out = evaluatePermissions(["instagram_basic", "instagram_manage_messages"], ["instagram_basic"], reg);
    expect(out.find((p) => p.permission === "instagram_manage_messages")?.status).toBe("missing");
    expect(out[0]?.why.length).toBeGreaterThan(10);
  });
});

describe("errors", () => {
  it("normalizes oauth errors into actionable UX", () => {
    const n = normalizeMetaError({ code: 190, message: "Invalid OAuth access token" }, { product: "instagram" });
    expect(n.category).toBe("oauth");
    expect(n.userActionRequired).toBe(true);
    expect(n.recommendedFix).toMatch(/Reconnect/);
  });

  it("marks rate limits retryable", () => {
    const n = normalizeMetaError({ code: 4, message: "Application request limit reached" });
    expect(n.retryable).toBe(true);
  });
});

describe("assets", () => {
  it("builds hierarchy and flags missing children honestly", () => {
    const roots = buildAssetGraph([
      { id: "b1", type: "business", product: "business", name: "Biz", metaId: "1", connectionId: "c", healthy: true },
      { id: "p1", type: "facebook_page", product: "facebook", name: "Page", metaId: "2", parentId: "b1", connectionId: "c", healthy: true },
    ]);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.children).toHaveLength(1);
    expect(roots[0]?.children[0]?.missingChildren).toContain("instagram_business_account");
  });
});

describe("webhooks", () => {
  it("verifies sha256 signatures", () => {
    const secret = "s";
    const body = "hello";
    const sig = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyWebhookSignature(body, "sha256=bad", secret)).toBe(false);
  });
});
