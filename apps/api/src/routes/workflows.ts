import { validateWorkflowDefinition } from "@metaflux/workflows";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireTenant, requestId, sendError } from "../tenant.js";

const createBody = z.object({
  name: z.string().min(1).max(120),
  definition: z.object({ nodes: z.array(z.unknown()), edges: z.array(z.unknown()) }),
});

export async function workflowRoutes(app: FastifyInstance) {
  app.post("/api/v1/workflows/validate", async (request, reply) => {
    const reqId = requestId(request);
    requireTenant(request);
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Invalid workflow payload", reqId, parsed.error.flatten());
    try {
      const def = validateWorkflowDefinition(parsed.data.definition as never);
      return reply.send({ data: { valid: true, definition: def }, requestId: reqId });
    } catch (err) {
      return sendError(reply, 422, "invalid_workflow", err instanceof Error ? err.message : "Invalid workflow", reqId);
    }
  });
}
