import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetQueueDriverForTests } from "@metaflux/queues";
import { __resetStoreForTests, getStore } from "@metaflux/database";
import { encryptToken } from "@metaflux/security";
import { buildServer } from "../server.js";

const HEADERS = { "x-user-id": "dev", "x-org-id": "org_dev" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(async () => {
  process.env.STORE_DRIVER = "memory";
  process.env.QUEUE_DRIVER = "memory";
  process.env.AUTH_SECRET = "a".repeat(32);
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  __resetStoreForTests();
  __resetQueueDriverForTests();
  const store = await getStore();
  await store.createWorkspace("org_dev", "Production");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("developer platform", () => {
  it("creates keys once-visible, scopes them, and revokes", async () => {
    const app = buildServer();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/keys",
      headers: HEADERS,
      payload: { name: "ci", scopes: ["events:read", "messages:send"] },
    });
    expect(created.statusCode).toBe(201);
    const raw = created.json().data.key as string;
    expect(raw.startsWith("mf_test_")).toBe(true);

    const listed = await app.inject({ method: "GET", url: "/api/v1/keys", headers: HEADERS });
    expect(listed.json().data).toHaveLength(1);
    expect(JSON.stringify(listed.json())).not.toContain(raw);

    // Key authenticates and carries its scopes.
    const events = await app.inject({ method: "GET", url: "/api/v1/events", headers: { Authorization: `Bearer ${raw}` } });
    expect(events.statusCode).toBe(200);
    // ...but cannot touch what its scopes exclude (keys management needs a session).
    const forbidden = await app.inject({ method: "GET", url: "/api/v1/keys", headers: { Authorization: `Bearer ${raw}` } });
    expect(forbidden.statusCode).toBe(403);

    const narrow = await app.inject({
      method: "POST",
      url: "/api/v1/keys",
      headers: HEADERS,
      payload: { name: "narrow", scopes: ["leads:read"] },
    });
    const narrowRaw = narrow.json().data.key as string;
    const denied = await app.inject({ method: "GET", url: "/api/v1/events", headers: { Authorization: `Bearer ${narrowRaw}` } });
    expect(denied.statusCode).toBe(403);

    const id = created.json().data.id as string;
    const revoked = await app.inject({ method: "POST", url: `/api/v1/keys/${id}/revoke`, headers: HEADERS });
    expect(revoked.json().data.revoked).toBe(true);
    const dead = await app.inject({ method: "GET", url: "/api/v1/events", headers: { Authorization: `Bearer ${raw}` } });
    expect(dead.statusCode).toBe(401);
  });

  it("sends messages through the unified endpoint with request inspection", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/phone_9/messages")) return jsonResponse({ messages: [{ id: "wamid_live" }] });
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const key = process.env.TOKEN_ENCRYPTION_KEY as string;
    const store = await getStore();
    const ws = await store.createWorkspace("org_dev", "Messaging");
    const conn = await store.upsertConnection({
      organizationId: "org_dev",
      workspaceId: ws.id,
      product: "whatsapp",
      status: "connected",
      scopes: [],
      encryptedToken: encryptToken("tok", key),
      tokenExpiresAt: null,
      metaUserId: null,
    });
    await store.replaceAssets(conn.id, "org_dev", [
      { metaId: "waba_9", type: "whatsapp_business_account", product: "whatsapp", name: "W" },
      { metaId: "phone_9", type: "phone_number", product: "whatsapp", name: "+1", parentMetaId: "waba_9" },
    ]);

    const app = buildServer();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/keys",
      headers: HEADERS,
      payload: { name: "sender", scopes: ["messages:send", "events:read"] },
    });
    const raw = created.json().data.key as string;

    const sent = await app.inject({
      method: "POST",
      url: "/api/v1/messages",
      headers: { Authorization: `Bearer ${raw}`, "x-workspace-id": conn.workspaceId },
      payload: { channel: "whatsapp", recipient: "+1999", message: "Hello from the explorer" },
    });
    expect(sent.statusCode).toBe(201);
    expect(sent.json().data.providerMessageId).toBe("wamid_live");
    expect(sent.json().data.provider).toBe("meta");

    // Request inspector captured the key-authenticated call.
    const logs = await app.inject({ method: "GET", url: "/api/v1/requests?status=201", headers: HEADERS });
    const entry = logs.json().data.items.find((r: { path: string }) => r.path === "/api/v1/messages");
    expect(entry).toBeTruthy();
    expect(entry.keyId).toBeTruthy();
    const one = await app.inject({ method: "GET", url: `/api/v1/requests/${entry.id}`, headers: HEADERS });
    expect(one.json().data.latencyMs).toBeGreaterThanOrEqual(0);

    const usage = await app.inject({ method: "GET", url: "/api/v1/usage", headers: HEADERS });
    expect(usage.json().data.apiRequests).toBeGreaterThan(0);
  });

  it("fails honestly without a sender", async () => {
    const app = buildServer();
    const sent = await app.inject({
      method: "POST",
      url: "/api/v1/messages",
      headers: HEADERS,
      payload: { channel: "whatsapp", recipient: "+1999", message: "hi" },
    });
    expect(sent.statusCode).toBe(400); // no workspace selected
  });
});
