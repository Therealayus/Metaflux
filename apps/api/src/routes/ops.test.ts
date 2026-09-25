import { beforeEach, describe, expect, it } from "vitest";
import { __resetCacheForTests } from "@socialflux/database";
import { __resetQueueDriverForTests } from "@socialflux/queues";
import { __resetStoreForTests } from "@socialflux/database";
import { buildServer } from "../server.js";

beforeEach(() => {
  process.env.STORE_DRIVER = "memory";
  process.env.QUEUE_DRIVER = "memory";
  process.env.CACHE_DRIVER = "memory";
  process.env.AUTH_SECRET = "a".repeat(32);
  delete process.env.ADMIN_API_KEY;
  __resetStoreForTests();
  __resetQueueDriverForTests();
  __resetCacheForTests();
});

describe("ops + admin", () => {
  it("serves liveness, readiness and prometheus metrics", async () => {
    const app = buildServer();
    expect((await app.inject({ method: "GET", url: "/live" })).statusCode).toBe(200);
    const ready = await app.inject({ method: "GET", url: "/api/v1/ready" });
    // No DATABASE_URL here: readiness honestly reports 503.
    expect([200, 503]).toContain(ready.statusCode);
    expect(ready.json().data.checks.database).toBeTruthy();
    const metricsRes = await app.inject({ method: "GET", url: "/api/v1/metrics" });
    expect(metricsRes.statusCode).toBe(200);
    expect(metricsRes.headers["content-type"]).toContain("text/plain");
    expect(metricsRes.body).toContain("socialflux_http_requests_total");
  });

  it("gates metrics behind a token when configured", async () => {
    process.env.METRICS_TOKEN = "secret-metrics";
    const app = buildServer();
    expect((await app.inject({ method: "GET", url: "/api/v1/metrics" })).statusCode).toBe(401);
    const ok = await app.inject({ method: "GET", url: "/api/v1/metrics", headers: { Authorization: "Bearer secret-metrics" } });
    expect(ok.statusCode).toBe(200);
    delete process.env.METRICS_TOKEN;
  });

  it("disables admin without a key, enforces it otherwise", async () => {
    const app = buildServer();
    expect((await app.inject({ method: "GET", url: "/api/v1/admin/overview" })).statusCode).toBe(501);

    process.env.ADMIN_API_KEY = "admin-secret";
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/admin/overview", headers: { Authorization: "Bearer wrong" } })).statusCode,
    ).toBe(403);
    const overview = await app.inject({
      method: "GET",
      url: "/api/v1/admin/overview",
      headers: { Authorization: "Bearer admin-secret" },
    });
    expect(overview.statusCode).toBe(200);
    expect(overview.json().data.queueDepth).toBe(0);

    const set = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/flags/ai.plan_cache",
      headers: { Authorization: "Bearer admin-secret" },
      payload: { enabled: true, percentage: 50 },
    });
    expect(set.json().data.updated).toBe(true);
    const flags = await app.inject({
      method: "GET",
      url: "/api/v1/admin/flags",
      headers: { Authorization: "Bearer admin-secret" },
    });
    expect(flags.json().data["ai.plan_cache"].percentage).toBe(50);
    const bad = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/flags/bad name!",
      headers: { Authorization: "Bearer admin-secret" },
      payload: { enabled: true },
    });
    expect(bad.statusCode).toBe(400);
    delete process.env.ADMIN_API_KEY;
  });
});
