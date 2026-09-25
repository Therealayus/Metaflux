import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetQueueDriverForTests } from "@socialflux/queues";
import { __resetStoreForTests, getStore } from "@socialflux/database";
import { buildServer } from "../server.js";

const ORG = "org_wf";
const HEADERS = { "x-user-id": "u1", "x-org-id": ORG };

const DEF = {
  nodes: [
    { id: "t", type: "trigger", label: "Comment", config: { product: "instagram", eventType: "comment.created", keyword: "price" } },
    { id: "l", type: "create_lead", label: "Lead", config: {} },
  ],
  edges: [{ id: "e1", source: "t", target: "l" }],
};

const SENDING_DEF = {
  nodes: [
    { id: "t", type: "trigger", label: "T", config: {} },
    { id: "m", type: "send_message", label: "M", config: { channel: "whatsapp", recipient: "x", text: "hi" } },
  ],
  edges: [{ id: "e1", source: "t", target: "m" }],
};

beforeEach(async () => {
  process.env.STORE_DRIVER = "memory";
  process.env.QUEUE_DRIVER = "memory";
  process.env.AUTH_SECRET = "a".repeat(32);
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  __resetStoreForTests();
  __resetQueueDriverForTests();
  const store = await getStore();
  const ws = await store.createWorkspace(ORG, "Production");
  (HEADERS as Record<string, string>)["x-workspace-id"] = ws.id;
});

describe("workflows api", () => {
  it("validates definitions without persisting", async () => {
    const app = buildServer();
    const ok = await app.inject({ method: "POST", url: "/api/v1/workflows/validate", headers: HEADERS, payload: { name: "x", definition: DEF } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.valid).toBe(true);
    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/workflows/validate",
      headers: HEADERS,
      payload: { name: "x", definition: { nodes: [], edges: [] } },
    });
    expect(bad.statusCode).toBe(422);
  });

  it("creates, lists, transitions, retries executions, and deletes with confirmation", async () => {
    const app = buildServer();
    // Sending workflows require explicit confirmation.
    const unconfirmed = await app.inject({
      method: "POST",
      url: "/api/v1/workflows",
      headers: HEADERS,
      payload: { name: "Sender", definition: SENDING_DEF },
    });
    expect(unconfirmed.statusCode).toBe(428);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/workflows",
      headers: { ...HEADERS, "x-confirm": "true" },
      payload: { name: "Price capture", definition: DEF },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().data.id as string;
    expect(created.json().data.status).toBe("draft");

    // Illegal transition draft->paused is rejected.
    const bad = await app.inject({ method: "PATCH", url: `/api/v1/workflows/${id}`, headers: HEADERS, payload: { status: "paused" } });
    expect(bad.statusCode).toBe(409);
    const active = await app.inject({ method: "PATCH", url: `/api/v1/workflows/${id}`, headers: HEADERS, payload: { status: "active" } });
    expect(active.json().data.status).toBe("active");

    const list = await app.inject({ method: "GET", url: "/api/v1/workflows?status=active", headers: HEADERS });
    expect(list.json().data.items).toHaveLength(1);

    const one = await app.inject({ method: "GET", url: `/api/v1/workflows/${id}`, headers: HEADERS });
    expect(one.json().data.name).toBe("Price capture");

    const execs = await app.inject({ method: "GET", url: `/api/v1/workflows/${id}/executions`, headers: HEADERS });
    expect(execs.json().data.items).toHaveLength(0);

    // Retry of a non-failed execution is rejected.
    const store = await getStore();
    const { record } = await store.createExecution({ workflowId: id, organizationId: ORG, idempotencyKey: "k1", input: {} });
    const retryQueued = await app.inject({ method: "POST", url: `/api/v1/executions/${record.id}/retry`, headers: HEADERS });
    expect(retryQueued.statusCode).toBe(409);
    await store.updateExecution(record.id, ORG, { status: "failed", error: "boom" });
    const retry = await app.inject({ method: "POST", url: `/api/v1/executions/${record.id}/retry`, headers: HEADERS });
    expect(retry.statusCode).toBe(202);

    const leads = await app.inject({ method: "GET", url: "/api/v1/leads", headers: HEADERS });
    expect(leads.json().data.items).toHaveLength(0);

    // Delete requires confirmation too.
    const delNo = await app.inject({ method: "DELETE", url: `/api/v1/workflows/${id}`, headers: HEADERS });
    expect(delNo.statusCode).toBe(428);
    const del = await app.inject({ method: "DELETE", url: `/api/v1/workflows/${id}`, headers: { ...HEADERS, "x-confirm": "true" } });
    expect(del.statusCode).toBe(200);
    expect(await store.getWorkflow(id, ORG)).toBeNull();
  });

  it("isolates tenants", async () => {
    const app = buildServer();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/workflows",
      headers: { ...HEADERS, "x-confirm": "true" },
      payload: { name: "W", definition: DEF },
    });
    const id = created.json().data.id as string;
    const other = await app.inject({
      method: "GET",
      url: `/api/v1/workflows/${id}`,
      headers: { "x-user-id": "u2", "x-org-id": "org_other" },
    });
    expect(other.statusCode).toBe(404);
  });
});
