import { getCache, listFlags, setFlag, deleteFlag } from "@metaflux/database";
import { PLANS } from "@metaflux/billing";
import { metrics } from "@metaflux/observability";
import { getQueueDriver } from "@metaflux/queues";
import { safeEqual } from "@metaflux/security";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requestId, sendError } from "../tenant.js";

/**
 * Separate secure admin surface. Authenticated by a dedicated ADMIN_API_KEY
 * bearer token (never a user session). Disabled entirely when unset.
 */
function requireAdmin(request: FastifyRequest): void {
  const configured = process.env.ADMIN_API_KEY;
  if (!configured) {
    throw Object.assign(new Error("Admin console is disabled on this instance"), { status: 501 });
  }
  const auth = request.headers.authorization;
  const presented = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!presented || !safeEqual(presented, configured)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
}

const setFlagBody = z.object({
  enabled: z.boolean(),
  percentage: z.number().int().min(0).max(100).optional(),
  allowOrgs: z.array(z.string()).optional(),
  denyOrgs: z.array(z.string()).optional(),
});

export async function adminRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/overview", async (request, reply) => {
    const reqId = requestId(request);
    try {
      requireAdmin(request);
    } catch (err) {
      return sendError(reply, (err as { status?: number }).status ?? 403, "forbidden", err instanceof Error ? err.message : "Forbidden", reqId);
    }
    const driver = getQueueDriver();
    const [depth, dlq] = await Promise.all([driver.queueDepth(), driver.dlqDepth()]);
    metrics.queueDepth.set(depth);
    metrics.dlqDepth.set(dlq);
    request.log.info({ msg: "admin overview viewed" });
    return reply.send({
      data: {
        queueDepth: depth,
        dlqDepth: dlq,
        flags: await listFlags(getCache()),
        plans: Object.keys(PLANS),
      },
      requestId: reqId,
    });
  });

  app.get("/api/v1/admin/dlq", async (request, reply) => {
    const reqId = requestId(request);
    try {
      requireAdmin(request);
    } catch (err) {
      return sendError(reply, (err as { status?: number }).status ?? 403, "forbidden", err instanceof Error ? err.message : "Forbidden", reqId);
    }
    const q = request.query as { limit?: string };
    const items = await getQueueDriver().peekDlq(Math.min(Number(q.limit ?? 20), 100));
    // Strip payloads: DLQ inspection shows routing metadata, not customer data.
    const safe = items.map((i) => ({ jobName: i.job.name, idempotencyKey: i.job.idempotencyKey, attempts: i.job.attempts, error: i.error, failedAt: i.failedAt }));
    return reply.send({ data: safe, requestId: reqId });
  });

  app.get("/api/v1/admin/flags", async (request, reply) => {
    const reqId = requestId(request);
    try {
      requireAdmin(request);
    } catch (err) {
      return sendError(reply, (err as { status?: number }).status ?? 403, "forbidden", err instanceof Error ? err.message : "Forbidden", reqId);
    }
    return reply.send({ data: await listFlags(getCache()), requestId: reqId });
  });

  app.put("/api/v1/admin/flags/:name", async (request, reply) => {
    const reqId = requestId(request);
    try {
      requireAdmin(request);
    } catch (err) {
      return sendError(reply, (err as { status?: number }).status ?? 403, "forbidden", err instanceof Error ? err.message : "Forbidden", reqId);
    }
    const parsed = setFlagBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Invalid flag value", reqId);
    const { name } = request.params as { name: string };
    try {
      await setFlag(getCache(), name, parsed.data);
    } catch (err) {
      return sendError(reply, 400, "invalid_flag", err instanceof Error ? err.message : "Invalid flag", reqId);
    }
    request.log.info({ flag: name, value: parsed.data, msg: "admin flag updated" });
    return reply.send({ data: { updated: true }, requestId: reqId });
  });

  app.delete("/api/v1/admin/flags/:name", async (request, reply) => {
    const reqId = requestId(request);
    try {
      requireAdmin(request);
    } catch (err) {
      return sendError(reply, (err as { status?: number }).status ?? 403, "forbidden", err instanceof Error ? err.message : "Forbidden", reqId);
    }
    const { name } = request.params as { name: string };
    await deleteFlag(getCache(), name);
    request.log.info({ flag: name, msg: "admin flag deleted" });
    return reply.send({ data: { deleted: true }, requestId: reqId });
  });
}
