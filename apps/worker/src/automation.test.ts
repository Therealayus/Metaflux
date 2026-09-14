import { randomBytes } from "node:crypto";
import { __resetStoreForTests, getStore } from "@metaflux/database";
import { __resetQueueDriverForTests, getQueueDriver } from "@metaflux/queues";
import { encryptToken } from "@metaflux/security";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAutomationHandlers } from "./automation.js";
import { clearHandlersForTests, ensureLoopHandlers, processOnce, registerCoreHandlersPublic } from "./processor.js";

const ORG = "org_auto";
const KEY = randomBytes(32).toString("base64");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  process.env.STORE_DRIVER = "memory";
  process.env.QUEUE_DRIVER = "memory";
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
  __resetStoreForTests();
  __resetQueueDriverForTests();
  clearHandlersForTests();
  registerCoreHandlersPublic();
  registerAutomationHandlers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const DEF = {
  nodes: [
    { id: "t", type: "trigger", label: "T", config: { product: "whatsapp", eventType: "message.received", keyword: "price" } },
    { id: "m", type: "send_message", label: "M", config: { channel: "whatsapp", recipient: "{{event.senderId}}", text: "Price is $9 ({{vars.text}})" } },
    { id: "l", type: "create_lead", label: "L", config: { phone: "{{event.senderId}}" } },
  ],
  edges: [
    { id: "e1", source: "t", target: "m" },
    { id: "e2", source: "m", target: "l" },
  ],
};

async function setup(withFetch?: (url: string | URL | Request) => Promise<Response>) {
  if (withFetch) vi.stubGlobal("fetch", vi.fn(withFetch));
  const store = await getStore();
  const ws = await store.createWorkspace(ORG, "Production");
  const conn = await store.upsertConnection({
    organizationId: ORG,
    workspaceId: ws.id,
    product: "whatsapp",
    status: "connected",
    scopes: [],
    encryptedToken: encryptToken("user_tok", KEY),
    tokenExpiresAt: null,
    metaUserId: null,
  });
  await store.replaceAssets(conn.id, ORG, [
    { metaId: "waba_1", type: "whatsapp_business_account", product: "whatsapp", name: "W" },
    { metaId: "phone_1", type: "phone_number", product: "whatsapp", name: "+1555", parentMetaId: "waba_1" },
  ]);
  const wf = await store.createWorkflow({ organizationId: ORG, workspaceId: ws.id, name: "Pricer", definition: DEF });
  await store.updateWorkflow(wf.id, ORG, { status: "active" });
  const { record: event } = await store.createEvent({
    organizationId: ORG,
    workspaceId: ws.id,
    provider: "meta",
    product: "whatsapp",
    eventType: "message.received",
    eventId: "wa_evt_1",
    payload: { entry: [{ changes: [{ value: { messages: [{ text: { body: "What is the PRICE?" } }], contacts: [{ wa_id: "+1999" }] } }] }] },
  });
  // Inject sender the way Meta does.
  (event.payload as Record<string, unknown>).senderId = "+1999";
  return { store, ws, wf, event };
}

describe("automation", () => {
  it("matches triggers and executes message + lead actions end-to-end", async () => {
    const seen: string[] = [];
    const { store, wf, event } = await setup(async (url) => {
      seen.push(String(url));
      return jsonResponse({ messages: [{ id: "wamid_abc" }] });
    });
    const { matchAndEnqueue } = await import("./automation.js");
    const { newJob } = await import("@metaflux/queues");

    // The production loop must not clobber the automation override (regression):
    // matching happens through processOnce, not a direct call.
    ensureLoopHandlers();
    const driver = getQueueDriver();
    await driver.enqueue(
      newJob("webhook.process", { eventDbId: event.id, eventId: event.eventId, organizationId: ORG }, "auto_evt_1"),
    );
    expect(await processOnce(driver)).toBe(1); // webhook.process matches + enqueues workflow.execute
    expect(await processOnce(driver)).toBe(1); // workflow.execute runs the graph

    // Duplicate match is idempotent.
    expect(await matchAndEnqueue(store, event)).toHaveLength(0);

    const execs = await store.listExecutions(wf.id, ORG, {});
    expect(execs.items).toHaveLength(1);
    expect(execs.items[0]?.status).toBe("succeeded");
    expect(seen.some((u) => u.includes("/phone_1/messages"))).toBe(true);

    const leads = await store.listLeads(ORG, {});
    expect(leads.items).toHaveLength(1);
    expect(leads.items[0]?.phone).toBe("+1999");
  });

  it("records failed executions honestly when Meta rejects the send", async () => {
    const { store, wf } = await setup(async () => jsonResponse({ error: { message: "Invalid phone", code: 100 } }, 400));

    const { matchAndEnqueue } = await import("./automation.js");
    const { record: event } = await store.createEvent({
      organizationId: ORG,
      workspaceId: (await store.listWorkflows(ORG, {})).items[0]?.workspaceId ?? "w",
      provider: "meta",
      product: "whatsapp",
      eventType: "message.received",
      eventId: "wa_evt_bad",
      payload: { senderId: "+1999", text: "price?" },
    });
    await matchAndEnqueue(store, event);
    const driver = getQueueDriver();
    await processOnce(driver); // workflow.execute -> send fails -> execution failed, job acked
    const execs = await store.listExecutions(wf.id, ORG, {});
    expect(execs.items).toHaveLength(1);
    expect(execs.items[0]?.status).toBe("failed");
    expect(execs.items[0]?.error).toContain("Invalid phone");
    expect(await driver.queueDepth()).toBe(0);
    expect(await driver.dlqDepth()).toBe(0);
  });
});
