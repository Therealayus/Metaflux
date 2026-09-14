import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PLANS, checkLimit, effectivePlan, getPlan, planFromStripePrice } from "./index.js";
import { createCheckoutSession, verifyStripeWebhook } from "./stripe.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("plans", () => {
  it("exposes tiered entitlements and evaluates limits purely", () => {
    expect(getPlan("free").entitlements.maxWorkflows).toBe(3);
    expect(PLANS.business.entitlements.maxExecutionsPerMonth).toBeNull();
    expect(checkLimit(2, 3, "workflows").ok).toBe(true);
    const over = checkLimit(3, 3, "workflows");
    expect(over.ok).toBe(false);
    expect(over.message).toContain("Upgrade");
    expect(effectivePlan("growth", "canceled").id).toBe("free");
    expect(effectivePlan("growth", "active").id).toBe("growth");
    expect(planFromStripePrice("price_x", { price_x: "starter" })).toBe("starter");
  });
});

describe("stripe", () => {
  it("creates checkout sessions over HTTPS", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ id: "cs_1", url: "https://checkout.stripe.com/x" }));
    const out = await createCheckoutSession(
      { secretKey: "sk", priceId: "price_1", plan: "starter", successUrl: "https://x/s", cancelUrl: "https://x/c", organizationId: "o1" },
      fetchFn as unknown as typeof fetch,
    );
    expect(out.url).toContain("checkout.stripe.com");
    const [, init] = (fetchFn.mock.calls[0] as unknown) as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization?.startsWith("Basic ")).toBe(true);
  });

  it("verifies webhook signatures with timestamp tolerance", () => {
    const secret = "whsec_test";
    const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: {} } });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
    const evt = verifyStripeWebhook(payload, `t=${t},v1=${v1}`, secret);
    expect(evt.type).toBe("checkout.session.completed");
    expect(() => verifyStripeWebhook(payload, "t=1,v1=bad", secret)).toThrow(/Stale/);
    expect(() => verifyStripeWebhook(payload, `t=${t},v1=deadbeef`, secret)).toThrow(/Invalid/);
  });
});
