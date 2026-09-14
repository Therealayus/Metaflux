import { createHmac, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetQueueDriverForTests } from "@metaflux/queues";
import { __resetStoreForTests, getStore } from "@metaflux/database";
import { buildServer } from "../server.js";

const ORG = "org_bill";
const HEADERS = { "x-user-id": "owner1", "x-org-id": ORG };

const DEF = {
  nodes: [{ id: "t", type: "trigger", label: "T", config: {} }],
  edges: [],
};

beforeEach(async () => {
  process.env.STORE_DRIVER = "memory";
  process.env.QUEUE_DRIVER = "memory";
  process.env.AUTH_SECRET = "a".repeat(32);
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  __resetStoreForTests();
  __resetQueueDriverForTests();
  const store = await getStore();
  const ws = await store.createWorkspace(ORG, "Production");
  (HEADERS as Record<string, string>)["x-workspace-id"] = ws.id;
});

describe("billing", () => {
  it("reports the free plan with live usage", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/api/v1/billing/subscription", headers: HEADERS });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.plan).toBe("free");
    expect(res.json().data.entitlements.maxWorkflows).toBe(3);
    expect(res.json().data.usage.workflows).toBe(0);
    expect(res.json().data.plans.length).toBeGreaterThanOrEqual(5);
  });

  it("enforces workflow limits and lifts them after upgrade", async () => {
    const app = buildServer();
    for (let i = 0; i < 3; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/workflows",
        headers: { ...HEADERS, "x-confirm": "true" },
        payload: { name: `W${i}`, definition: DEF },
      });
      expect(r.statusCode).toBe(201);
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/api/v1/workflows",
      headers: { ...HEADERS, "x-confirm": "true" },
      payload: { name: "W3", definition: DEF },
    });
    expect(blocked.statusCode).toBe(402);
    expect(blocked.json().code).toBe("plan_limit");

    const upgrade = await app.inject({
      method: "POST",
      url: "/api/v1/billing/plan",
      headers: HEADERS,
      payload: { plan: "growth" },
    });
    expect(upgrade.json().data.plan).toBe("growth");
    const allowed = await app.inject({
      method: "POST",
      url: "/api/v1/workflows",
      headers: { ...HEADERS, "x-confirm": "true" },
      payload: { name: "W3", definition: DEF },
    });
    expect(allowed.statusCode).toBe(201);
  });

  it("requires ownership for manual plan changes", async () => {
    // API keys authenticate as member: key management aside, plan change needs owner.
    const app = buildServer();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/keys",
      headers: HEADERS,
      payload: { name: "k", scopes: ["events:read"] },
    });
    const raw = created.json().data.key as string;
    const denied = await app.inject({
      method: "POST",
      url: "/api/v1/billing/plan",
      headers: { Authorization: `Bearer ${raw}` },
      payload: { plan: "growth" },
    });
    expect(denied.statusCode).toBe(403);
  });

  it("processes Stripe webhooks with verified signatures", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const app = buildServer();
    const payload = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { metadata: { organizationId: ORG, plan: "starter" }, customer: "cus_1", subscription: "sub_1" } },
    });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", "whsec_test").update(`${t}.${payload}`).digest("hex");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${v1}` },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const store = await getStore();
    expect((await store.getSubscription(ORG))?.plan).toBe("starter");

    const forged = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=deadbeef` },
      payload,
    });
    expect(forged.statusCode).toBe(401);
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("handles subscription deletion by falling back to free", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const store = await getStore();
    await store.upsertSubscription(ORG, { plan: "growth", status: "active", stripeSubscriptionId: "sub_9" });
    const app = buildServer();
    const payload = JSON.stringify({
      id: "evt_2",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_9", customer: "cus_9" } },
    });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", "whsec_test").update(`${t}.${payload}`).digest("hex");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${v1}` },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const sub = await store.getSubscription(ORG);
    expect(sub?.plan).toBe("free");
    expect(sub?.status).toBe("canceled");
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("reports unconfigured checkout honestly", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/billing/checkout",
      headers: HEADERS,
      payload: { plan: "starter" },
    });
    expect(res.statusCode).toBe(501);
  });
});
