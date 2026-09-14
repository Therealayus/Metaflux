import { RuleBasedPlanner, validatePlan } from "@metaflux/ai";
import { CapabilityRegistry, DEFAULT_CAPABILITIES } from "@metaflux/meta";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireTenant, requestId, sendError } from "../tenant.js";

const planBody = z.object({ prompt: z.string().min(3).max(2000) });

export async function aiRoutes(app: FastifyInstance) {
  const registry = new CapabilityRegistry(DEFAULT_CAPABILITIES);
  const planner = new RuleBasedPlanner();

  app.post("/api/v1/ai/plan", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireTenant(request);
    const parsed = planBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Prompt is required", reqId, parsed.error.flatten());
    const raw = await planner.generatePlan(parsed.data.prompt);
    const plan = validatePlan(raw, registry);
    request.log.info({ requestId: reqId, organizationId: ctx.organizationId, intent: plan.intent });
    return reply.send({ data: plan, requestId: reqId });
  });
}
