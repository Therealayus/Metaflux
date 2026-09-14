import { getStore } from "@metaflux/database";
import { getQueueDriver, newJob } from "@metaflux/queues";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { persistPayload, payloadStoreFromEnv, readPayload } from "../payloads.js";
import { requestId, requireTenant, sendError } from "../tenant.js";

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  product: z.string().optional(),
  status: z.string().optional(),
});

const testEventBody = z.object({
  product: z.string().min(1).max(40).default("instagram"),
  eventType: z.string().min(1).max(120).default("comment.created"),
  objectId: z.string().min(1).max(120).optional(),
  payload: z.record(z.unknown()).default({}),
});

export async function eventRoutes(app: FastifyInstance) {
  const store = await getStore();
  const payloads = payloadStoreFromEnv();

  app.get("/api/v1/events", async (request, reply) => {
    const ctx = requireTenant(request);
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Invalid query", requestId(request));
    // Workspace scoping: explicit param wins, else session workspace, else whole org.
    const q = request.query as { workspaceId?: string };
    const workspaceId = q.workspaceId ?? ctx.workspaceId;
    const listed = await store.listEvents(ctx.organizationId, { ...parsed.data, workspaceId });
    return reply.send({ data: listed.items, nextCursor: listed.nextCursor, requestId: requestId(request) });
  });

  app.get("/api/v1/events/:id", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireTenant(request);
    const { id } = request.params as { id: string };
    const event = await store.getEvent(id, ctx.organizationId);
    if (!event) return sendError(reply, 404, "not_found", "Event not found", reqId);
    const resolved = await readPayload(payloads, event.payloadRef, event.payload);
    return reply.send({ data: { ...event, ...resolved }, requestId: reqId });
  });

  // Replay: re-enqueue processing for an existing event with a fresh idempotency key.
  app.post("/api/v1/events/:id/replay", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireTenant(request);
    const { id } = request.params as { id: string };
    const event = await store.getEvent(id, ctx.organizationId);
    if (!event) return sendError(reply, 404, "not_found", "Event not found", reqId);
    await store.updateEvent(id, ctx.organizationId, { status: "requeued", error: null });
    const job = newJob(
      "webhook.process",
      { eventDbId: event.id, eventId: event.eventId, organizationId: event.organizationId, workspaceId: event.workspaceId, replay: true },
      `replay:${event.id}:${Date.now()}`,
    );
    await getQueueDriver().enqueue(job);
    await store.audit(ctx.organizationId, ctx.userId, "webhook.event.replayed", id);
    return reply.status(202).send({ data: { requeued: true, jobId: job.id }, requestId: reqId });
  });

  // Synthetic test event through the real pipeline (developer tooling).
  app.post("/api/v1/webhooks/meta/test", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireTenant(request);
    const parsed = testEventBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Invalid test event", reqId);
    const workspaceId = ctx.workspaceId;
    if (!workspaceId) return sendError(reply, 400, "workspace_required", "Select a workspace first", reqId);
    const eventId = `test_${randomBytes(6).toString("hex")}`;
    const stored = await persistPayload(payloads, ctx.organizationId, eventId, {
      ...parsed.data.payload,
      _synthetic: true,
      object: parsed.data.product,
    });
    const { record } = await store.createEvent({
      organizationId: ctx.organizationId,
      workspaceId,
      provider: "meta",
      product: parsed.data.product,
      eventType: parsed.data.eventType,
      eventId,
      payloadRef: stored.ref ?? null,
      payload: stored.inline,
    });
    const job = newJob(
      "webhook.process",
      { eventDbId: record.id, eventId, organizationId: ctx.organizationId, workspaceId, synthetic: true },
      eventId,
    );
    await getQueueDriver().enqueue(job);
    return reply.status(202).send({ data: { accepted: true, eventId, jobId: job.id }, requestId: reqId });
  });
}
