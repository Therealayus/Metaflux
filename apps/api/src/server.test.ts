import { beforeEach, describe, expect, it } from "vitest";
import { __resetQueueDriverForTests } from "@metaflux/queues";
import { __resetStoreForTests } from "@metaflux/database";
import { buildServer } from "./server.js";

beforeEach(() => {
  process.env.STORE_DRIVER = "memory";
  process.env.QUEUE_DRIVER = "memory";
  __resetStoreForTests();
  __resetQueueDriverForTests();
});

describe("api foundation", () => {
  it("exposes versioned health endpoint", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("ok");
  });

  it("serves capability + permission registries", async () => {
    const app = buildServer();
    const caps = await app.inject({ method: "GET", url: "/api/v1/capabilities" });
    expect(caps.json().data.length).toBeGreaterThan(3);
    const perms = await app.inject({ method: "GET", url: "/api/v1/permissions" });
    expect(perms.json().data.length).toBeGreaterThan(3);
  });

  it("requires tenant context for AI planning", async () => {
    const app = buildServer();
    const denied = await app.inject({ method: "POST", url: "/api/v1/ai/plan", payload: { prompt: "hi there" } });
    expect(denied.statusCode).toBe(401);
    const ok = await app.inject({
      method: "POST",
      url: "/api/v1/ai/plan",
      headers: { "x-user-id": "u", "x-org-id": "o" },
      payload: { prompt: "When someone comments PRICE, send a WhatsApp message" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.intent).toBe("comment_to_whatsapp");
  });

  it("verifies webhook subscriptions and accepts events fast", async () => {
    const app = buildServer();
    const verify = await app.inject({
      method: "GET",
      url: "/api/v1/webhooks/meta?hub.mode=subscribe&hub.verify_token=change-me-webhook-verify-token&hub.challenge=abc",
    });
    expect(verify.statusCode).toBe(200);
    const evt = await app.inject({ method: "POST", url: "/api/v1/webhooks/meta", payload: { object: "instagram" } });
    expect(evt.statusCode).toBe(202);
  });
});
