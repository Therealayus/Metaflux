import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetQueueDriverForTests, getQueueDriver } from "@socialflux/queues";
import { __resetStoreForTests, getStore } from "@socialflux/database";
import { buildServer } from "../server.js";

const ORG = "org_evt";
const HEADERS = { "x-user-id": "u1", "x-org-id": ORG, "x-workspace-id": "ws_evt" };

const WEBHOOK_BODY = {
  object: "page",
  entry: [{ id: "page_1", time: 1_700_000_000, changes: [{ field: "feed", value: { item: "comment" } }] }],
};

beforeEach(async () => {
  process.env.STORE_DRIVER = "memory";
  process.env.QUEUE_DRIVER = "memory";
  process.env.AUTH_SECRET = "a".repeat(32);
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.META_APP_SECRET;
  delete process.env.S3_BUCKET;
  __resetStoreForTests();
  __resetQueueDriverForTests();

  const store = await getStore();
  const ws = await store.createWorkspace(ORG, "Production");
  HEADERS["x-workspace-id"] = ws.id;
  const conn = await store.upsertConnection({
    organizationId: ORG,
    workspaceId: ws.id,
    product: "facebook",
    status: "connected",
    scopes: [],
    encryptedToken: "enc",
    tokenExpiresAt: null,
    metaUserId: null,
  });
  await store.replaceAssets(conn.id, ORG, [
    { metaId: "page_1", type: "facebook_page", product: "facebook", name: "Acme" },
  ]);
});

describe("webhook pipeline", () => {
  it("persists events, deduplicates redeliveries, and enqueues work", async () => {
    const app = buildServer();
    const first = await app.inject({ method: "POST", url: "/api/v1/webhooks/meta", payload: WEBHOOK_BODY });
    expect(first.statusCode).toBe(202);
    expect(first.json().data.jobId).toBeTruthy();

    const store = await getStore();
    expect((await store.listEvents(ORG, {})).items).toHaveLength(1);
    expect(await getQueueDriver().queueDepth()).toBe(1);

    const second = await app.inject({ method: "POST", url: "/api/v1/webhooks/meta", payload: WEBHOOK_BODY });
    expect(second.json().data.duplicate).toBe(true);
    expect((await store.listEvents(ORG, {})).items).toHaveLength(1);
  });

  it("acknowledges unmapped senders without losing the 2xx Meta requires", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/meta",
      payload: { object: "page", entry: [{ id: "stranger_page", time: 1, changes: [{ field: "feed" }] }] },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().data.mapped).toBe(false);
  });

  it("rejects forged signatures when the app secret is configured", async () => {
    process.env.META_APP_SECRET = "real-secret";
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/meta",
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
      payload: WEBHOOK_BODY,
    });
    expect(res.statusCode).toBe(401);
    delete process.env.META_APP_SECRET;
  });
});

describe("events api", () => {
  it("lists, inspects, replays and synthesizes events", async () => {
    const app = buildServer();
    await app.inject({ method: "POST", url: "/api/v1/webhooks/meta", payload: WEBHOOK_BODY });

    const list = await app.inject({ method: "GET", url: "/api/v1/events", headers: HEADERS });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.items).toHaveLength(1);
    expect(list.json().data.items[0].payload).toBeNull(); // list views omit payloads
    const id = list.json().data.items[0].id as string;

    const one = await app.inject({ method: "GET", url: `/api/v1/events/${id}`, headers: HEADERS });
    expect(one.statusCode).toBe(200);
    expect(one.json().data.payload.entry[0].id).toBe("page_1");
    expect(one.json().data.storage).toBe("inline");

    const replay = await app.inject({ method: "POST", url: `/api/v1/events/${id}/replay`, headers: HEADERS });
    expect(replay.statusCode).toBe(202);

    const test = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/meta/test",
      headers: HEADERS,
      payload: { product: "instagram", eventType: "comment.created", payload: { text: "PRICE" } },
    });
    expect(test.statusCode).toBe(202);
    const after = await (await getStore()).listEvents(ORG, {});
    expect(after.items).toHaveLength(2);

    // Cursor pagination over a second page.
    const page1 = await app.inject({ method: "GET", url: "/api/v1/events?limit=1", headers: HEADERS });
    expect(page1.json().data.items).toHaveLength(1);
    expect(page1.json().data.nextCursor).toBeTruthy();
    const page2 = await app.inject({
      method: "GET",
      url: `/api/v1/events?limit=1&cursor=${page1.json().data.nextCursor}`,
      headers: HEADERS,
    });
    expect(page2.json().data.items).toHaveLength(1);
    expect(page2.json().data.items[0].id).not.toBe(page1.json().data.items[0].id);

    // Foreign tenant sees nothing.
    const other = await app.inject({
      method: "GET",
      url: "/api/v1/events",
      headers: { "x-user-id": "u9", "x-org-id": "org_other" },
    });
    expect(other.json().data.items).toHaveLength(0);
  });
});
