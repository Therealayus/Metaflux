import { metrics, renderMetrics } from "@socialflux/observability";
import { getQueueDriver } from "@socialflux/queues";
import type { FastifyInstance } from "fastify";
import { requestId } from "../tenant.js";

/** Unauthenticated liveness probe for orchestrators. */
export async function opsRoutes(app: FastifyInstance) {
  app.get("/live", async (_request, reply) => {
    return reply.send({ status: "live" });
  });

  app.get("/api/v1/live", async (_request, reply) => {
    return reply.send({ data: { status: "live" }, requestId: requestId(_request) });
  });

  // Readiness: database + redis reachability. Fails fast with 503.
  app.get("/api/v1/ready", async (request, reply) => {
    const checks: Record<string, string> = {};
    let ok = true;
    try {
      const { getPrisma } = await import("@socialflux/database");
      await getPrisma().$queryRaw`SELECT 1`;
      checks.database = "ok";
    } catch (err) {
      ok = false;
      checks.database = err instanceof Error ? err.message : "unreachable";
    }
    if (process.env.REDIS_URL) {
      try {
        const { Redis } = await import("ioredis");
        const client = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
        await client.ping();
        client.disconnect();
        checks.redis = "ok";
      } catch (err) {
        ok = false;
        checks.redis = err instanceof Error ? err.message : "unreachable";
      }
    } else {
      checks.redis = "skipped (no REDIS_URL)";
    }
    try {
      const driver = getQueueDriver();
      metrics.queueDepth.set(await driver.queueDepth());
      metrics.dlqDepth.set(await driver.dlqDepth());
      checks.queue = "ok";
    } catch (err) {
      checks.queue = err instanceof Error ? err.message : "unknown";
    }
    request.log.info({ checks, msg: "readiness check" });
    return reply.status(ok ? 200 : 503).send({ data: { ready: ok, checks }, requestId: requestId(request) });
  });

  // Prometheus exposition. Guard with METRICS_TOKEN in production.
  app.get("/api/v1/metrics", async (request, reply) => {
    const token = process.env.METRICS_TOKEN;
    if (token) {
      const auth = request.headers.authorization;
      if (auth !== `Bearer ${token}`) {
        return reply.status(401).send("Unauthorized");
      }
    }
    try {
      const driver = getQueueDriver();
      metrics.queueDepth.set(await driver.queueDepth());
      metrics.dlqDepth.set(await driver.dlqDepth());
    } catch {
      // Depth gauges are best-effort; counters still render.
    }
    return reply.header("Content-Type", "text/plain; version=0.0.4").send(renderMetrics());
  });
}
