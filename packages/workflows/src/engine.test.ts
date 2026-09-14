import { describe, expect, it, vi } from "vitest";
import type { WorkflowDefinition } from "@metaflux/types";
import {
  extractEventText,
  runWorkflow,
  transitionWorkflowStatus,
  triggerMatches,
} from "./engine.js";
import { validateWorkflowDefinition } from "./index.js";

function def(nodes: WorkflowDefinition["nodes"], edges: WorkflowDefinition["edges"]): WorkflowDefinition {
  return validateWorkflowDefinition({ nodes, edges });
}

const services = () => ({
  sendMessage: vi.fn(async () => ({ providerMessageId: "wamid_1" })),
  createLead: vi.fn(async () => ({ id: "lead_1" })),
  httpCall: vi.fn(async () => ({ status: 200, body: {} })),
  aiReply: vi.fn(async () => "AI reply"),
  log: vi.fn(),
});

const base = { product: "instagram", eventType: "comment.created", eventId: "e1", payload: {} };

describe("triggers", () => {
  const d = def(
    [{ id: "t", type: "trigger", label: "T", config: { product: "instagram", eventType: "comment.created", keyword: "price" } }],
    [],
  );
  it("matches product, type and keyword", () => {
    expect(triggerMatches(d, { product: "instagram", eventType: "comment.created", payloadText: "What is the PRICE?" })).toBe(true);
    expect(triggerMatches(d, { product: "whatsapp", eventType: "comment.created", payloadText: "price" })).toBe(false);
    expect(triggerMatches(d, { product: "instagram", eventType: "comment.created", payloadText: "hello" })).toBe(false);
  });

  it("extracts text from nested Meta payloads", () => {
    const text = extractEventText({ entry: [{ changes: [{ value: { text: "PRICE please" } }] }] });
    expect(text).toContain("PRICE please");
    // Real WhatsApp payloads nest ~9 levels deep.
    const deep = extractEventText({
      entry: [{ changes: [{ value: { messages: [{ text: { body: "PRICE?" } }] } }] }],
    });
    expect(deep).toContain("PRICE?");
  });
});

describe("engine", () => {
  it("runs filter -> dm -> lead chains", async () => {
    const d = def(
      [
        { id: "t", type: "trigger", label: "T", config: {} },
        { id: "f", type: "filter", label: "F", config: { keyword: "buy" } },
        { id: "m", type: "send_message", label: "M", config: { channel: "instagram", recipient: "{{event.senderId}}", text: "Hi {{vars.text}}" } },
        { id: "l", type: "create_lead", label: "L", config: { phone: "{{vars.text}}" } },
      ],
      [
        { id: "e1", source: "t", target: "f" },
        { id: "e2", source: "f", target: "m" },
        { id: "e3", source: "m", target: "l" },
      ],
    );
    const svc = services();
    const out = await runWorkflow(
      d,
      { ...base, event: { ...base, senderId: "user_9", payload: { entry: [{ changes: [{ value: { text: "I want to BUY" } }] }] } } as never, vars: {} },
      svc,
    );
    expect(out.status).toBe("succeeded");
    expect(svc.sendMessage).toHaveBeenCalledTimes(1);
    expect(svc.createLead).toHaveBeenCalledTimes(1);
    expect(out.output.lead_l).toBe("lead_1");
  });

  it("filters out non-matching events without side effects", async () => {
    const d = def(
      [
        { id: "t", type: "trigger", label: "T", config: {} },
        { id: "f", type: "filter", label: "F", config: { keyword: "buy" } },
        { id: "m", type: "send_message", label: "M", config: { channel: "x", recipient: "r", text: "t" } },
      ],
      [
        { id: "e1", source: "t", target: "f" },
        { id: "e2", source: "f", target: "m" },
      ],
    );
    const svc = services();
    const out = await runWorkflow(d, { ...base, event: { ...base, payload: { text: "hello" } }, vars: {} }, svc);
    expect(out.status).toBe("filtered");
    expect(svc.sendMessage).not.toHaveBeenCalled();
  });

  it("branches on conditions via labeled edges", async () => {
    const d = def(
      [
        { id: "t", type: "trigger", label: "T", config: {} },
        { id: "c", type: "branch", label: "C", config: { field: "vars.text", operator: "contains", value: "vip" } },
        { id: "y", type: "log", label: "Y", config: { message: "vip" } },
        { id: "n", type: "log", label: "N", config: { message: "std" } },
      ],
      [
        { id: "e1", source: "t", target: "c" },
        { id: "e2", source: "c", target: "y", label: "yes" },
        { id: "e3", source: "c", target: "n", label: "no" },
      ],
    );
    const svc = services();
    await runWorkflow(d, { ...base, event: { ...base, payload: { text: "vip customer" } }, vars: {} }, svc);
    expect(svc.log).toHaveBeenCalledWith("vip");
  });

  it("suspends at delay nodes for durable resume", async () => {
    const d = def(
      [
        { id: "t", type: "trigger", label: "T", config: {} },
        { id: "w", type: "delay", label: "W", config: { seconds: 60 } },
        { id: "m", type: "log", label: "M", config: { message: "after" } },
      ],
      [
        { id: "e1", source: "t", target: "w" },
        { id: "e2", source: "w", target: "m" },
      ],
    );
    const svc = services();
    const suspended = await runWorkflow(d, { event: { ...base }, vars: {} }, svc);
    expect(suspended.status).toBe("suspended");
    expect(suspended.resume?.nodeId).toBe("m");
    expect(suspended.resume?.delayMs).toBe(60_000);
    expect(svc.log).not.toHaveBeenCalled();
    const resumed = await runWorkflow(d, { event: { ...base }, vars: {} }, svc, suspended.resume?.nodeId, suspended.resume?.vars);
    expect(resumed.status).toBe("succeeded");
    expect(svc.log).toHaveBeenCalledWith("after");
  });

  it("blocks SSRF targets in webhook nodes", async () => {
    const d = def(
      [
        { id: "t", type: "trigger", label: "T", config: {} },
        { id: "h", type: "http_request", label: "H", config: { url: "http://169.254.169.254/x", method: "POST" } },
      ],
      [{ id: "e1", source: "t", target: "h" }],
    );
    await expect(runWorkflow(d, { event: { ...base }, vars: {} }, services())).rejects.toThrow(/not allowed/);
  });
});

describe("status machine", () => {
  it("allows draft->active->paused->active and forbids resurrection", () => {
    expect(transitionWorkflowStatus("draft", "active")).toBe("active");
    expect(transitionWorkflowStatus("active", "paused")).toBe("paused");
    expect(transitionWorkflowStatus("paused", "active")).toBe("active");
    expect(() => transitionWorkflowStatus("draft", "paused")).toThrow();
    expect(() => transitionWorkflowStatus("archived", "active")).toThrow();
  });
});
