import {
  MemoryBudgetStore,
  RuleBasedPlanner,
  assertBudgetAvailable,
  buildDiagnosis,
  llmGeneratePlanRaw,
  monthStartIso,
  monthlyBudgetCents,
  providersFromEnv,
  routeModel,
  toBudgetUsage,
  validatePlan,
  type BudgetStore,
  type BudgetUsage,
} from "@metaflux/ai";
import {
  CapabilityRegistry,
  DEFAULT_CAPABILITIES,
  DEFAULT_PERMISSIONS,
  PermissionRegistry,
  normalizeMetaError,
} from "@metaflux/meta";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireScope } from "@metaflux/auth";
import { getStore } from "@metaflux/database";
import type { Store } from "@metaflux/database";
import { aiBudgetCents } from "@metaflux/billing";
import { requestId, requireTenant, sendError } from "../tenant.js";

const planBody = z.object({ prompt: z.string().min(3).max(2000) });
const explainBody = z.object({ permission: z.string().min(1).max(120) });
const diagnoseBody = z.object({
  connectionId: z.string().min(1).optional(),
  errorCode: z.number().optional(),
  errorSubcode: z.number().optional(),
  message: z.string().max(2000).optional(),
  product: z.string().max(40).optional(),
});

/** Postgres-backed budget store reusing the tenant-safe Store. */
class StoreBudgetStore implements BudgetStore {
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

export async function aiRoutes(app: FastifyInstance) {
  const store = await getStore();
  const registry = new CapabilityRegistry(DEFAULT_CAPABILITIES);
  const permRegistry = new PermissionRegistry(DEFAULT_PERMISSIONS);
  const planner = new RuleBasedPlanner();
  const budgets: BudgetStore =
    process.env.STORE_DRIVER === "memory" ? new MemoryBudgetStore() : new StoreBudgetStore(store);

  async function narrative(
    organizationId: string,
    task: "explain" | "diagnose" | "summarize",
    prompt: string,
    fallback: string,
  ): Promise<{ text: string; source: "llm" | "fallback"; usage?: BudgetUsage }> {
    const llm = providersFromEnv();
    const provider = llm.cheap;
    if (!provider) return { text: fallback, source: "fallback" };
    try {
      await assertBudgetAvailable(budgets, organizationId, await aiBudgetCents(store, organizationId));
      const started = Date.now();
      const out = await provider.chat([{ role: "user", content: prompt }], { maxTokens: 400 });
      const usage = toBudgetUsage({
        model: out.model,
        tokensIn: out.tokensIn,
        tokensOut: out.tokensOut,
        requestType: task,
        latencyMs: Date.now() - started,
      });
      await budgets.record(organizationId, usage);
      return { text: out.text, source: "llm", usage };
    } catch (err) {
      app.log.warn({ err, msg: "llm narrative failed, using fallback" });
      return { text: fallback, source: "fallback" };
    }
  }

  app.post("/api/v1/ai/plan", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireScope(await requireTenant(request), "ai:use");
    const parsed = planBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Prompt is required", reqId, parsed.error.flatten());

    const llm = providersFromEnv();
    const tier = routeModel("plan", parsed.data.prompt.length);
    const provider = tier === "strong" ? (llm.strong ?? llm.cheap) : (llm.cheap ?? llm.strong);
    let raw: unknown;
    let source: "llm" | "fallback" = "fallback";
    let usage: BudgetUsage | undefined;

    if (provider) {
      // Plan-aware cap enforced BEFORE spending. Exhaustion is a hard 429.
      try {
        await assertBudgetAvailable(budgets, ctx.organizationId, await aiBudgetCents(store, ctx.organizationId));
      } catch (err) {
        return sendError(reply, 429, "ai_budget_exhausted", err instanceof Error ? err.message : "AI budget exhausted", reqId);
      }
      try {
        const started = Date.now();
        const out = await llmGeneratePlanRaw(provider, parsed.data.prompt);
        raw = out.raw;
        source = "llm";
        usage = toBudgetUsage({
          model: out.usage.model,
          tokensIn: out.usage.tokensIn,
          tokensOut: out.usage.tokensOut,
          requestType: "plan",
          latencyMs: Date.now() - started,
        });
        await budgets.record(ctx.organizationId, usage);
      } catch (err) {
        request.log.warn({ requestId: reqId, err, msg: "llm planning failed, using rule-based fallback" });
        raw = await planner.generatePlan(parsed.data.prompt);
      }
    } else {
      raw = await planner.generatePlan(parsed.data.prompt);
    }

    try {
      const plan = validatePlan(raw, registry);
      request.log.info({ requestId: reqId, organizationId: ctx.organizationId, intent: plan.intent, source });
      return reply.send({ data: { ...plan, source }, requestId: reqId });
    } catch (err) {
      return sendError(reply, 422, "invalid_plan", "The AI produced an unusable plan — please rephrase", reqId, {
        hint: err instanceof Error ? err.message : undefined,
      });
    }
  });

  app.post("/api/v1/ai/explain", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireScope(await requireTenant(request), "ai:use");
    const parsed = explainBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "permission is required", reqId);
    const def = permRegistry.get(parsed.data.permission);
    if (!def) return sendError(reply, 404, "unknown_permission", "Unknown permission", reqId);
    const fallback = await planner.explainPermission({ permission: def.name, product: def.product, why: def.why });
    const { text, source } = await narrative(
      ctx.organizationId,
      "explain",
      `In two sentences for a non-technical business owner, explain why the Meta permission "${def.name}" is needed. Context: ${def.why}`,
      fallback,
    );
    return reply.send({
      data: {
        permission: def.name,
        product: def.product,
        why: def.why,
        reviewRequired: def.reviewRequired,
        elaboration: text,
        source,
      },
      requestId: reqId,
    });
  });

  app.post("/api/v1/ai/diagnose", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireScope(await requireTenant(request), "ai:use");
    const parsed = diagnoseBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Invalid diagnose payload", reqId);

    let evidenceConn: { status?: string; webhook?: string; scopes?: string[] } = {};
    let product = parsed.data.product;
    if (parsed.data.connectionId) {
      const conn = await store.getConnection(parsed.data.connectionId, ctx.organizationId);
      if (!conn) return sendError(reply, 404, "not_found", "Connection not found", reqId);
      product = product ?? conn.product;
      evidenceConn = {
        status: conn.status,
        webhook: conn.webhookStatus ?? undefined,
        scopes: conn.scopes,
      };
    }

    const normalized =
      parsed.data.errorCode !== undefined || parsed.data.message
        ? normalizeMetaError(
            { code: parsed.data.errorCode, error_subcode: parsed.data.errorSubcode, message: parsed.data.message },
            { product },
          )
        : undefined;

    const diagnosis = buildDiagnosis({
      error: normalized
        ? {
            category: normalized.category,
            headline: normalized.headline,
            probableCause: normalized.probableCause,
            recommendedFix: normalized.recommendedFix,
            retryable: normalized.retryable,
          }
        : undefined,
      evidence: {
        connectionStatus: evidenceConn.status,
        webhookStatus: evidenceConn.webhook === "active" ? "active" : evidenceConn.webhook === "inactive" ? "inactive" : undefined,
      },
    });

    const fallbackNarrative = await planner.diagnoseError({
      headline: diagnosis.rootCause,
      detail: diagnosis.evidence.join("; ") || "no additional evidence",
    });
    const { text, source } = await narrative(
      ctx.organizationId,
      "diagnose",
      `A Meta integration reports: "${diagnosis.rootCause}" (certainty: ${diagnosis.certainty}). Evidence: ${diagnosis.evidence.join("; ") || "none"}. Explain the likely cause and next step in two sentences.`,
      fallbackNarrative,
    );

    return reply.send({ data: { ...diagnosis, narrative: text, source }, requestId: reqId });
  });

  app.get("/api/v1/ai/usage", async (request, reply) => {
    const ctx = await requireTenant(request);
    const spent = await budgets.sumCostCentsSince(ctx.organizationId, monthStartIso());
    return reply.send({
      data: { spentCents: Math.round(spent * 100) / 100, budgetCents: monthlyBudgetCents(), monthStart: monthStartIso() },
      requestId: requestId(request),
    });
  });

}
