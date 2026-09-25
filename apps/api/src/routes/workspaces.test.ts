import { beforeEach, describe, expect, it } from "vitest";
import { __resetQueueDriverForTests } from "@socialflux/queues";
import { __resetStoreForTests } from "@socialflux/database";
import { buildServer } from "../server.js";

const HEADERS = { "x-user-id": "u1", "x-org-id": "org_ws" };

beforeEach(() => {
  process.env.STORE_DRIVER = "memory";
  process.env.QUEUE_DRIVER = "memory";
  process.env.CACHE_DRIVER = "memory";
  __resetStoreForTests();
  __resetQueueDriverForTests();
});

describe("workspaces", () => {
  it("lists empty, creates (admin), and isolates tenants", async () => {
    const app = buildServer();
    expect((await app.inject({ method: "GET", url: "/api/v1/workspaces", headers: HEADERS })).json().data).toHaveLength(0);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces",
      headers: HEADERS,
      payload: { name: "Production" },
    });
    expect(created.statusCode).toBe(201);
    const list = await app.inject({ method: "GET", url: "/api/v1/workspaces", headers: HEADERS });
    expect(list.json().data).toHaveLength(1);
    expect(list.json().data[0].name).toBe("Production");
    const other = await app.inject({
      method: "GET",
      url: "/api/v1/workspaces",
      headers: { "x-user-id": "u2", "x-org-id": "org_other" },
    });
    expect(other.json().data).toHaveLength(0);
  });
});
