import { getStore } from "@socialflux/database";
import { requireScope } from "@socialflux/auth";
import { assertCanCreateWorkflow } from "@socialflux/billing";
import { newJob, getQueueDriver } from "@socialflux/queues";
import { transitionWorkflowStatus, validateWorkflowDefinition, workflowNeedsConfirmation } from "@socialflux/workflows";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireTenant, requestId, sendError } from "../tenant.js";

const definitionSchema = z.object({ nodes: z.array(z.unknown()), edges: z.array(z.unknown()) });
const createBody = z.object({
  name: z.string().min(1).max(120),
  workspaceId: z.string().min(1).optional(),
  definition: definitionSchema,
});
const updateBody = z.object({
  name: z.string().min(1).max(120).optional(),
  definition: definitionSchema.optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
});
const listQuery = z.object({
  workspaceId: z.string().optional(),
  status: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function workflowRoutes(app: FastifyInstance) {
  const store = await getStore();

  app.post("/api/v1/workflows/validate", async (request, reply) => {
    const reqId = requestId(request);
    await requireTenant(request);
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Invalid workflow payload", reqId, parsed.error.flatten());
    try {
      const def = validateWorkflowDefinition(parsed.data.definition as never);
      return reply.send({ data: { valid: true, needsConfirmation: workflowNeedsConfirmation(def) }, requestId: reqId });
    } catch (err) {
      return sendError(reply, 422, "invalid_workflow", err instanceof Error ? err.message : "Invalid workflow", reqId);
    }
  });

  app.post("/api/v1/workflows", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireScope(await requireTenant(request), "workflows:write");
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Invalid workflow payload", reqId, parsed.error.flatten());
    const workspaceId = parsed.data.workspaceId ?? ctx.workspaceId;
    if (!workspaceId) return sendError(reply, 400, "workspace_required", "workspaceId is required", reqId);
    try {
      await assertCanCreateWorkflow(store, ctx.organizationId);
      const def = validateWorkflowDefinition(parsed.data.definition as never);
      if (workflowNeedsConfirmation(def) && request.headers["x-confirm"] !== "true") {
        return sendError(reply, 428, "confirmation_required", "This workflow sends messages or calls webhooks. Retry with x-confirm: true.", reqId);
      }
      const wf = await store.createWorkflow({ organizationId: ctx.organizationId, workspaceId, name: parsed.data.name, definition: def });
      await store.audit(ctx.organizationId, ctx.userId, "workflow.created", wf.id);
      return reply.status(201).send({ data: wf, requestId: reqId });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 422;
      const code = (err as { code?: string }).code ?? "invalid_workflow";
      return sendError(reply, status, code, err instanceof Error ? err.message : "Invalid workflow", reqId);
    }
  });

  app.get("/api/v1/workflows", async (request, reply) => {
    const ctx = requireScope(await requireTenant(request), "workflows:read");
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Invalid query", requestId(request));
    const listed = await store.listWorkflows(ctx.organizationId, parsed.data);
    return reply.send({ data: { items: listed.items, nextCursor: listed.nextCursor }, requestId: requestId(request) });
  });

  app.get("/api/v1/workflows/:id", async (request, reply) => {
    const ctx = requireScope(await requireTenant(request), "workflows:read");
    const { id } = request.params as { id: string };
    const wf = await store.getWorkflow(id, ctx.organizationId);
    if (!wf) return sendError(reply, 404, "not_found", "Workflow not found", requestId(request));
    return reply.send({ data: wf, requestId: requestId(request) });
  });

  app.patch("/api/v1/workflows/:id", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireScope(await requireTenant(request), "workflows:write");
    const { id } = request.params as { id: string };
    const parsed = updateBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Invalid update", reqId, parsed.error.flatten());
    const wf = await store.getWorkflow(id, ctx.organizationId);
    if (!wf) return sendError(reply, 404, "not_found", "Workflow not found", reqId);
    try {
      let definition = wf.definition;
      if (parsed.data.definition) definition = validateWorkflowDefinition(parsed.data.definition as never);
      if (parsed.data.status) {
        transitionWorkflowStatus(
          wf.status as "draft" | "active" | "paused" | "archived",
          parsed.data.status,
        );
      }
      const updated = await store.updateWorkflow(id, ctx.organizationId, {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.definition ? { definition } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      });
      await store.audit(ctx.organizationId, ctx.userId, "workflow.updated", id);
      return reply.send({ data: updated, requestId: reqId });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 422;
      return sendError(reply, status, "invalid_update", err instanceof Error ? err.message : "Invalid update", reqId);
    }
  });

  app.delete("/api/v1/workflows/:id", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireScope(await requireTenant(request), "workflows:write");
    if (request.headers["x-confirm"] !== "true") {
      return sendError(reply, 428, "confirmation_required", "Deleting a workflow stops its automations. Retry with x-confirm: true.", reqId);
    }
    const { id } = request.params as { id: string };
    await store.deleteWorkflow(id, ctx.organizationId);
    await store.audit(ctx.organizationId, ctx.userId, "workflow.deleted", id);
    return reply.send({ data: { deleted: true }, requestId: reqId });
  });

  app.get("/api/v1/workflows/:id/executions", async (request, reply) => {
    const ctx = requireScope(await requireTenant(request), "workflows:read");
    const { id } = request.params as { id: string };
    const q = request.query as { cursor?: string; limit?: string };
    const listed = await store.listExecutions(id, ctx.organizationId, {
      cursor: q.cursor,
      limit: q.limit ? Number(q.limit) : undefined,
    });
    return reply.send({ data: { items: listed.items, nextCursor: listed.nextCursor }, requestId: requestId(request) });
  });

  app.get("/api/v1/executions/:id", async (request, reply) => {
    const ctx = requireScope(await requireTenant(request), "workflows:read");
    const { id } = request.params as { id: string };
    const exe = await store.getExecution(id, ctx.organizationId);
    if (!exe) return sendError(reply, 404, "not_found", "Execution not found", requestId(request));
    return reply.send({ data: exe, requestId: requestId(request) });
  });

  // Retry a failed execution from the trigger (fresh run, new idempotency key).
  app.post("/api/v1/executions/:id/retry", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireScope(await requireTenant(request), "workflows:write");
    const { id } = request.params as { id: string };
    const exe = await store.getExecution(id, ctx.organizationId);
    if (!exe) return sendError(reply, 404, "not_found", "Execution not found", reqId);
    if (exe.status !== "failed") {
      return sendError(reply, 409, "not_failed", "Only failed executions can be retried", reqId);
    }
    const wf = await store.getWorkflow(exe.workflowId, ctx.organizationId);
    if (!wf || wf.status !== "active") {
      return sendError(reply, 409, "workflow_inactive", "Workflow is not active", reqId);
    }
    const input = (exe.input ?? {}) as { eventDbId?: string };
    await store.updateExecution(id, ctx.organizationId, { status: "queued", error: null });
    const job = newJob(
      "workflow.execute",
      { executionDbId: exe.id, workflowId: exe.workflowId, eventDbId: input.eventDbId, organizationId: ctx.organizationId },
      `wf-retry:${exe.id}:${Date.now()}`,
    );
    await getQueueDriver().enqueue(job);
    return reply.status(202).send({ data: { requeued: true, jobId: job.id }, requestId: reqId });
  });

  app.get("/api/v1/leads", async (request, reply) => {
    const ctx = requireScope(await requireTenant(request), "leads:read");
    const q = request.query as { workspaceId?: string; cursor?: string; limit?: string };
    const listed = await store.listLeads(ctx.organizationId, {
      workspaceId: q.workspaceId,
      cursor: q.cursor,
      limit: q.limit ? Number(q.limit) : undefined,
    });
    return reply.send({ data: { items: listed.items, nextCursor: listed.nextCursor }, requestId: requestId(request) });
  });
}
