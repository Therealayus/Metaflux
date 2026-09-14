import { assertSafeHttpUrl } from "@metaflux/security";
import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from "@metaflux/types";

export type WorkflowStatus = "draft" | "active" | "paused" | "archived";

const TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  draft: ["active", "archived"],
  active: ["paused", "archived"],
  paused: ["active", "archived"],
  archived: [],
};

/** Guarded status machine. Throws on illegal transitions. */
export function transitionWorkflowStatus(from: WorkflowStatus, to: WorkflowStatus): WorkflowStatus {
  if (from === to) return from;
  if (!TRANSITIONS[from]?.includes(to)) {
    throw Object.assign(new Error(`Cannot transition workflow from ${from} to ${to}`), { status: 409 });
  }
  return to;
}

export interface TriggerMatch {
  product?: string;
  eventType?: string;
  keyword?: string;
}

export function parseTriggerConfig(node: WorkflowNode): TriggerMatch {
  const c = (node.config ?? {}) as Record<string, unknown>;
  return {
    product: typeof c.product === "string" ? c.product : undefined,
    eventType: typeof c.eventType === "string" ? c.eventType : undefined,
    keyword: typeof c.keyword === "string" ? c.keyword : undefined,
  };
}

/** Extract human text from a Meta webhook payload for keyword matching. */
export function extractEventText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const texts: string[] = [];
  const visit = (v: unknown, depth: number): void => {
    if (depth > 12 || texts.join(" ").length > 2000) return;
    if (typeof v === "string") {
      // Skip opaque ids/hashes: only keep strings with a letter and reasonable length.
      if (/[a-zA-Z]/.test(v) && v.length <= 500) texts.push(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) visit(item, depth + 1);
      return;
    }
    if (v && typeof v === "object") {
      for (const val of Object.values(v as Record<string, unknown>)) visit(val, depth + 1);
    }
  };
  visit(payload, 0);
  return texts.join(" ").slice(0, 2000);
}

/** Trigger matching: product + eventType must match; keyword (if set) must appear in payload text. */
export function triggerMatches(
  def: WorkflowDefinition,
  input: { product: string; eventType: string; payloadText: string },
): boolean {
  const trigger = def.nodes.find((n) => n.type === "trigger");
  if (!trigger) return false;
  const cfg = parseTriggerConfig(trigger);
  if (cfg.product && cfg.product !== input.product) return false;
  if (cfg.eventType && cfg.eventType !== input.eventType) return false;
  if (cfg.keyword && !input.payloadText.toLowerCase().includes(cfg.keyword.toLowerCase())) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export interface EngineContext {
  event: { product: string; eventType: string; eventId: string; payload: unknown };
  vars: Record<string, unknown>;
}

export interface EngineServices {
  sendMessage: (input: { channel: string; recipient: string; text: string; idempotencyKey: string }) => Promise<{ providerMessageId: string }>;
  createLead: (input: { name?: string; phone?: string; email?: string; attributes?: unknown }) => Promise<{ id: string }>;
  httpCall: (input: { url: string; method: string; body?: unknown }) => Promise<{ status: number; body: unknown }>;
  aiReply: (input: { prompt: string }) => Promise<string>;
  log: (message: string) => void;
}

export interface StepResult {
  nodeId: string;
  type: string;
  label: string;
  status: "ok" | "skipped" | "suspended";
  detail?: string;
}

export interface EngineOutcome {
  status: "succeeded" | "suspended" | "filtered";
  steps: StepResult[];
  /** For delay nodes: resume from this node id after delayMs. */
  resume?: { nodeId: string; delayMs: number; vars: Record<string, unknown> };
  output: Record<string, unknown>;
}

function renderTemplate(template: string, ctx: EngineContext): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const parts = path.split(".");
    let cur: unknown = { event: ctx.event, vars: ctx.vars };
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        return "";
      }
    }
    return typeof cur === "string" ? cur : JSON.stringify(cur ?? "");
  });
}

function outgoing(def: WorkflowDefinition, nodeId: string): WorkflowEdge[] {
  return def.edges.filter((e) => e.source === nodeId);
}

function evaluateCondition(config: Record<string, unknown>, ctx: EngineContext): boolean {
  const field = typeof config.field === "string" ? config.field : "event.text";
  const operator = typeof config.operator === "string" ? config.operator : "contains";
  const value = String(config.value ?? "");
  const rendered = renderTemplate(`{{${field}}}`, ctx);
  switch (operator) {
    case "contains":
      return rendered.toLowerCase().includes(value.toLowerCase());
    case "equals":
      return rendered === value;
    case "starts_with":
      return rendered.toLowerCase().startsWith(value.toLowerCase());
    case "exists":
      return rendered.length > 0;
    default:
      throw new Error(`Unsupported condition operator: ${operator}`);
  }
}

const MAX_STEPS = 50;

/**
 * Deterministic workflow runner. No I/O except through injected services.
 * Supports resume-from-node for durable delays across job boundaries.
 */
export async function runWorkflow(
  def: WorkflowDefinition,
  baseCtx: EngineContext,
  services: EngineServices,
  startFromNodeId?: string,
  incomingVars?: Record<string, unknown>,
): Promise<EngineOutcome> {
  const ctx: EngineContext = { ...baseCtx, vars: { ...(incomingVars ?? {}), text: extractEventText(baseCtx.event.payload) } };
  const steps: StepResult[] = [];
  const output: Record<string, unknown> = {};

  let currentId: string | undefined;
  if (startFromNodeId) {
    currentId = startFromNodeId;
  } else {
    const trigger = def.nodes.find((n) => n.type === "trigger");
    if (!trigger) throw new Error("Workflow has no trigger");
    const next = outgoing(def, trigger.id)[0];
    currentId = next?.target;
    steps.push({ nodeId: trigger.id, type: "trigger", label: trigger.label, status: "ok" });
  }

  const visited = new Set<string>();
  let hop = 0;
  while (currentId && hop++ < MAX_STEPS) {
    if (visited.has(currentId)) throw new Error(`Cycle detected at node ${currentId}`);
    visited.add(currentId);
    const node = def.nodes.find((n) => n.id === currentId);
    if (!node) throw new Error(`Unknown node ${currentId}`);
    const config = (node.config ?? {}) as Record<string, unknown>;
    const next = await executeNode(def, node, config, ctx, services, steps, output);
    if (next.suspended) {
      return { status: "suspended", steps, resume: { nodeId: next.suspended, delayMs: next.delayMs ?? 0, vars: ctx.vars }, output };
    }
    if (next.filtered) {
      return { status: "filtered", steps, output };
    }
    currentId = next.nextId;
  }
  if (hop >= MAX_STEPS) throw new Error("Workflow exceeded maximum steps — possible cycle");
  return { status: "succeeded", steps, output };
}

async function executeNode(
  def: WorkflowDefinition,
  node: WorkflowNode,
  config: Record<string, unknown>,
  ctx: EngineContext,
  services: EngineServices,
  steps: StepResult[],
  output: Record<string, unknown>,
): Promise<{ nextId?: string; suspended?: string; delayMs?: number; filtered?: boolean }> {
  const outs = outgoing(def, node.id);
  const first = outs[0]?.target;

  switch (node.type) {
    case "filter": {
      const keyword = typeof config.keyword === "string" ? config.keyword : "";
      const text = String(ctx.vars.text ?? "");
      if (keyword && !text.toLowerCase().includes(keyword.toLowerCase())) {
        steps.push({ nodeId: node.id, type: node.type, label: node.label, status: "skipped", detail: `keyword "${keyword}" not present` });
        return { filtered: true };
      }
      steps.push({ nodeId: node.id, type: node.type, label: node.label, status: "ok" });
      return { nextId: first };
    }

    case "condition":
    case "branch": {
      const result = evaluateCondition(config, ctx);
      steps.push({ nodeId: node.id, type: node.type, label: node.label, status: "ok", detail: String(result) });
      // Edge labels "yes"/"true" take the true path; unlabeled first edge is the true path.
      const edge =
        outs.find((e) => (e.label ?? "").toLowerCase() === (result ? "yes" : "no")) ??
        outs.find((e) => (e.label ?? "").toLowerCase() === (result ? "true" : "false")) ??
        (result ? outs[0] : (outs[1] ?? outs[0]));
      return { nextId: edge?.target };
    }

    case "delay": {
      const delayMs = Math.min(Math.max(Number(config.delayMs ?? config.seconds ?? 0) * (config.delayMs ? 1 : 1000), 0), 24 * 3600 * 1000);
      steps.push({ nodeId: node.id, type: node.type, label: node.label, status: "suspended", detail: `${delayMs}ms` });
      return { suspended: first ?? node.id, delayMs };
    }

    case "transform": {
      const template = typeof config.template === "string" ? config.template : "";
      const key = typeof config.as === "string" && config.as.length > 0 ? config.as : "transformed";
      const rendered = renderTemplate(template, ctx);
      ctx.vars[key] = rendered;
      output[key] = rendered;
      steps.push({ nodeId: node.id, type: node.type, label: node.label, status: "ok" });
      return { nextId: first };
    }

    case "send_message": {
      const channel = String(config.channel ?? "whatsapp");
      const recipient = renderTemplate(String(config.recipient ?? "{{event.senderId}}"), ctx);
      const text = renderTemplate(String(config.text ?? ""), ctx);
      if (!recipient) throw new Error(`send_message node ${node.id}: empty recipient`);
      if (!text) throw new Error(`send_message node ${node.id}: empty text`);
      const res = await services.sendMessage({ channel, recipient, text, idempotencyKey: String(ctx.event.eventId) });
      output[`message_${node.id}`] = res.providerMessageId;
      steps.push({ nodeId: node.id, type: node.type, label: node.label, status: "ok", detail: res.providerMessageId });
      return { nextId: first };
    }

    case "create_lead": {
      const lead = await services.createLead({
        name: config.name ? renderTemplate(String(config.name), ctx) : undefined,
        phone: config.phone ? renderTemplate(String(config.phone), ctx) : undefined,
        email: config.email ? renderTemplate(String(config.email), ctx) : undefined,
        attributes: { eventId: ctx.event.eventId, nodeId: node.id },
      });
      output[`lead_${node.id}`] = lead.id;
      steps.push({ nodeId: node.id, type: node.type, label: node.label, status: "ok", detail: lead.id });
      return { nextId: first };
    }

    case "webhook":
    case "http_request": {
      const url = String(config.url ?? "");
      if (!url) throw new Error(`${node.type} node ${node.id}: missing url`);
      assertSafeHttpUrl(url);
      const method = String(config.method ?? "POST").toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH"].includes(method)) throw new Error(`Unsupported method ${method}`);
      const body = config.body ? JSON.parse(renderTemplate(typeof config.body === "string" ? config.body : JSON.stringify(config.body), ctx)) : undefined;
      const res = await services.httpCall({ url, method, body });
      output[`http_${node.id}`] = res.status;
      steps.push({ nodeId: node.id, type: node.type, label: node.label, status: "ok", detail: String(res.status) });
      return { nextId: first };
    }

    case "ai": {
      const prompt = renderTemplate(String(config.prompt ?? "{{vars.text}}"), ctx);
      const replyText = await services.aiReply({ prompt: prompt.slice(0, 2000) });
      const key = typeof config.as === "string" && config.as.length > 0 ? config.as : "ai_reply";
      ctx.vars[key] = replyText;
      output[key] = replyText;
      steps.push({ nodeId: node.id, type: node.type, label: node.label, status: "ok" });
      return { nextId: first };
    }

    case "log": {
      const message = renderTemplate(String(config.message ?? ""), ctx);
      services.log(message);
      steps.push({ nodeId: node.id, type: node.type, label: node.label, status: "ok" });
      return { nextId: first };
    }

    default:
      throw new Error(`Unsupported node type: ${node.type}`);
  }
}
