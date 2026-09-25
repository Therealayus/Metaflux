import {
  assertBudgetAvailable,
  monthStartIso,
  providersFromEnv,
  toBudgetUsage,
  type BudgetStore,
  type BudgetUsage,
} from "@socialflux/ai";
import {
  getStore,
  type EventRecord,
  type Store,
  type WorkflowRecord,
} from "@socialflux/database";
import {
  MetaApiClient,
  extractSenderId,
  parseChannel,
  resolveSender,
} from "@socialflux/meta";
import { assertExecutionBudget, aiBudgetCents } from "@socialflux/billing";
import { decryptToken } from "@socialflux/security";
import { childLogger, metrics } from "@socialflux/observability";
import { getQueueDriver, newJob } from "@socialflux/queues";
import {
  extractEventText,
  runWorkflow,
  triggerMatches,
  validateWorkflowDefinition,
  type EngineServices,
} from "@socialflux/workflows";
import { registerHandler } from "./processor.js";

const META_VERSION = process.env.META_GRAPH_API_VERSION ?? "v21.0";

/** Meta webhook object names -> trigger product names. */
function productOf(event: EventRecord): string {
  if (event.product === "page") return "facebook";
  return event.product;
}

function tokenKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  return key;
}

class WorkerBudgetStore implements BudgetStore {
  constructor(private store: Store) {}
  async record(organizationId: string, usage: BudgetUsage): Promise<void> {
    await this.store.recordAiUsage(organizationId, {
      model: usage.model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costCents: usage.costCents,
      requestType: usage.requestType,
      latencyMs: 0,
    });
  }
  async sumCostCentsSince(organizationId: string, sinceIso: string): Promise<number> {
    return this.store.sumAiUsageCostSince(organizationId, sinceIso);
  }
}

interface MessagingCtx {
  send: (input: { channel: "whatsapp" | "instagram" | "facebook"; recipient: string; text: string; idempotencyKey: string }) => Promise<{ providerMessageId: string }>;
}

/** Resolve a Meta messaging sender for a channel from live connections + assets. */
async function resolveMessaging(
  store: Store,
  organizationId: string,
  workspaceId: string,
  channel: string,
): Promise<MessagingCtx> {
  const parsed = parseChannel(channel);
  const connections = await store.listConnections(organizationId, workspaceId);
  const assets = await store.listAssets(organizationId, workspaceId);
  const key = tokenKey();
  const { provider } = resolveSender({
    channel: parsed,
    connections: connections.map((c) => ({ id: c.id, product: c.product, encryptedToken: c.encryptedToken })),
    assets: assets.map((a) => ({ connectionId: a.connectionId, type: a.type, metaId: a.metaId, encryptedToken: a.encryptedToken })),
    decrypt: (ciphertext) => decryptToken(ciphertext, key),
    client: new MetaApiClient(META_VERSION),
  });
  return { send: async (input) => provider.sendMessage({ ...input, channel: parsed }) };
}

function servicesFor(
  store: Store,
  organizationId: string,
  workspaceId: string,
  workflowId: string,
  log: ReturnType<typeof childLogger>,
): EngineServices {
  return {
    sendMessage: async (input) => {
      const channel = parseChannel(input.channel);
      const resolved = await resolveMessaging(store, organizationId, workspaceId, channel);
      return resolved.send({ ...input, channel });
    },
    createLead: async (input) => {
      const lead = await store.createLead({
        organizationId,
        workspaceId,
        workflowId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        source: "workflow",
        attributes: input.attributes,
      });
      return { id: lead.id };
    },
    httpCall: async (input) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(input.url, {
          method: input.method,
          headers: { "Content-Type": "application/json" },
          body: input.body === undefined ? undefined : JSON.stringify(input.body),
          signal: controller.signal,
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(`HTTP ${input.method} ${input.url} -> ${res.status}`);
        return { status: res.status, body };
      } finally {
        clearTimeout(timer);
      }
    },
    aiReply: async (input) => {
      const llm = providersFromEnv();
      const provider = llm.cheap ?? llm.strong;
      if (!provider) throw new Error("AI node requires an LLM provider (set OPENAI_API_KEY or ANTHROPIC_API_KEY)");
      const budgets = new WorkerBudgetStore(store);
      await assertBudgetAvailable(budgets, organizationId, await aiBudgetCents(store, organizationId));
      const started = Date.now();
      const out = await provider.chat(
        [{ role: "system", content: "You are a helpful business assistant replying to a customer. Be concise." }, { role: "user", content: input.prompt }],
        { maxTokens: 300 },
      );
      const usage = toBudgetUsage({ model: out.model, tokensIn: out.tokensIn, tokensOut: out.tokensOut, requestType: "workflow_ai", latencyMs: Date.now() - started });
      await budgets.record(organizationId, usage);
      metrics.aiSpendCents.inc({ organizationId, model: usage.model }, usage.costCents);
      return out.text;
    },
    log: (message) => log.info({ workflowId, msg: message }),
  };
}

export interface ExecutePayload {
  executionDbId: string;
  workflowId: string;
  eventDbId: string;
  organizationId: string;
  resume?: { nodeId: string; vars: Record<string, unknown> };
}

/** Match an event against active workflows and enqueue executions (idempotent). */
export async function matchAndEnqueue(store: Store, event: EventRecord): Promise<string[]> {
  if (!event.workspaceId) return [];
  try {
    await assertExecutionBudget(store, event.organizationId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "execution budget exhausted";
    childLogger({ operation: "webhook.process" }).warn({ eventId: event.eventId, msg: message });
    await store.audit(event.organizationId, null, "workflow.executions.paused_plan_limit", event.id).catch(() => undefined);
    return [];
  }
  const product = productOf(event);
  const payload = (event.payload ?? {}) as unknown;
  const payloadText = extractEventText(payload);
  const senderId = extractSenderId(payload);
  const { items } = await store.listWorkflows(event.organizationId, {
    workspaceId: event.workspaceId,
    status: "active",
    limit: 100,
  });
  const enqueued: string[] = [];
  for (const wf of items) {
    let def;
    try {
      def = validateWorkflowDefinition(wf.definition as never);
    } catch {
      continue; // Corrupt definition: skip honestly, surface via executions view later.
    }
    if (!triggerMatches(def, { product, eventType: event.eventType, payloadText })) continue;
    const key = `wf:${wf.id}:${event.eventId}`;
    const { record, created } = await store.createExecution({
      workflowId: wf.id,
      organizationId: event.organizationId,
      idempotencyKey: key,
      input: { eventDbId: event.id, eventId: event.eventId, product, eventType: event.eventType, senderId },
    });
    if (!created) continue;
    await getQueueDriver().enqueue(
      newJob<ExecutePayload>(
        "workflow.execute",
        { executionDbId: record.id, workflowId: wf.id, eventDbId: event.id, organizationId: event.organizationId },
        key,
      ),
    );
    enqueued.push(record.id);
  }
  return enqueued;
}

async function runExecution(store: Store, log: ReturnType<typeof childLogger>, payload: ExecutePayload): Promise<void> {
  const wf: WorkflowRecord | null = await store.getWorkflow(payload.workflowId, payload.organizationId);
  if (!wf) {
    log.warn({ workflowId: payload.workflowId, msg: "workflow gone; skipping execution" });
    return;
  }
  const def = validateWorkflowDefinition(wf.definition as never);
  const execution = await store.getExecution(payload.executionDbId, payload.organizationId);
  if (!execution) {
    log.warn({ executionId: payload.executionDbId, msg: "execution row gone; skipping" });
    return;
  }
  if (execution.status === "succeeded") return; // Duplicate delivery after success.

  let eventPayload: unknown = {};
  let eventMeta = { product: "meta", eventType: "unknown", eventId: payload.eventDbId, senderId: undefined as string | undefined };
  if (!payload.resume) {
    const event = await store.getEvent(payload.eventDbId, payload.organizationId);
    if (event) {
      eventPayload = event.payload ?? {};
      eventMeta = {
        product: productOf(event),
        eventType: event.eventType,
        eventId: event.eventId,
        senderId: extractSenderId(eventPayload),
      };
    }
  }

  await store.updateExecution(execution.id, payload.organizationId, { status: "running" });
  const services = servicesFor(store, payload.organizationId, wf.workspaceId, wf.id, log);
  try {
    const outcome = await runWorkflow(
      def,
      {
        event: { ...eventMeta, payload: { ...(eventPayload as object), senderId: eventMeta.senderId }, senderId: eventMeta.senderId } as never,
        vars: {},
      },
      services,
      payload.resume?.nodeId,
      payload.resume?.vars,
    );
    if (outcome.status === "suspended" && outcome.resume) {
      await store.updateExecution(execution.id, payload.organizationId, { status: "suspended", output: { steps: outcome.steps } });
      await getQueueDriver().enqueue(
        newJob<ExecutePayload>(
          "workflow.execute",
          {
            executionDbId: execution.id,
            workflowId: wf.id,
            eventDbId: payload.eventDbId,
            organizationId: payload.organizationId,
            resume: { nodeId: outcome.resume.nodeId, vars: outcome.resume.vars },
          },
          `wf-resume:${execution.id}:${outcome.resume.nodeId}`,
        ),
        outcome.resume.delayMs,
      );
      return;
    }
    await store.updateExecution(execution.id, payload.organizationId, {
      status: "succeeded",
      output: { steps: outcome.steps, output: outcome.output, filtered: outcome.status === "filtered" },
      error: null,
    });
    metrics.workflowExecutions.inc({ status: "succeeded" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "execution failed";
    await store.updateExecution(execution.id, payload.organizationId, { status: "failed", error: message });
    metrics.workflowExecutions.inc({ status: "failed" });
    log.warn({ executionId: execution.id, err: message, msg: "execution failed (acked, see execution row)" });
  }
}

export function registerAutomationHandlers(): void {
  // Override core webhook.process: match triggers, then mark processed.
  registerHandler("webhook.process", async (job, ctx) => {
    const p = job.payload as { eventDbId: string; eventId: string; organizationId: string };
    const event = await ctx.store.getEvent(p.eventDbId, p.organizationId);
    if (!event) {
      ctx.log.warn({ jobId: job.id, msg: "event row gone; acknowledging stale job" });
      return;
    }
    await ctx.store.updateEvent(event.id, event.organizationId, { status: "processing", attemptCount: job.attempts + 1 });
    const matched = await matchAndEnqueue(ctx.store, event);
    await ctx.store.updateEvent(event.id, event.organizationId, {
      status: "processed",
      processedAt: new Date().toISOString(),
      error: null,
    });
    ctx.log.info({ jobId: job.id, eventId: event.eventId, matched: matched.length, msg: "event processed" });
  });

  registerHandler("workflow.execute", async (job, ctx) => {
    await runExecution(ctx.store, ctx.log, job.payload as ExecutePayload);
  });
}
