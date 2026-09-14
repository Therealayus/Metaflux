import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import { getStore } from "@metaflux/database";
import Fastify from "fastify";
import { aiRoutes } from "./routes/ai.js";
import { authRoutes } from "./routes/auth.js";
import { capabilityRoutes } from "./routes/capabilities.js";
import { connectionRoutes } from "./routes/connections.js";
import { developerRoutes } from "./routes/developer.js";
import { eventRoutes } from "./routes/events.js";
import { healthRoutes } from "./routes/health.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { workflowRoutes } from "./routes/workflows.js";
import { requestId, resolveTenant } from "./tenant.js";

const SKIP_LOGGING = new Set(["/api/v1/health", "/api/v1/metrics", "/api/v1/live", "/api/v1/ready"]);

export function buildServer() {
  const app = Fastify({ logger: true, genReqId: () => requestId({ headers: {} } as never) });

  app.register(fastifyHelmet, { contentSecurityPolicy: false });
  app.register(fastifyCors, { origin: process.env.WEB_URL ?? "http://localhost:3000", credentials: true });
  app.register(fastifyCookie);
  app.register(fastifyRateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
    timeWindow: "1 minute",
    // Per-API-key buckets; sessions and anonymous traffic fall back to IP.
    keyGenerator: (request) => {
      const auth = request.headers.authorization;
      if (typeof auth === "string" && auth.startsWith("Bearer mf_")) return `key:${auth.slice(0, 20)}`;
      const header = request.headers["x-api-key"];
      if (typeof header === "string" && header.startsWith("mf_")) return `key:${header.slice(0, 20)}`;
      return `ip:${request.ip}`;
    },
  });

  app.setErrorHandler((err: Error & { status?: number }, request, reply) => {
    const status = (err as { status?: number }).status ?? 500;
    const reqId = requestId(request);
    request.log.error({ requestId: reqId, err });
    return reply.status(status).send({
      code: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "internal_error",
      message: status >= 500 ? "Something went wrong. Please retry." : err.message,
      requestId: reqId,
    });
  });

  // Request inspector log. Runs in onSend (before the response completes) so
  // logs are durable when the client receives the response. Best-effort otherwise.
  app.addHook("onSend", async (request, reply, payload) => {
    const path = request.url.split("?")[0] ?? request.url;
    if (!SKIP_LOGGING.has(path)) {
      try {
        const ctx = await resolveTenant(request);
        if (ctx) {
          const store = await getStore();
          await store.appendApiRequest({
            organizationId: ctx.organizationId,
            keyId: ctx.apiKeyId ?? null,
            method: request.method,
            path,
            status: reply.statusCode,
            latencyMs: Math.round(reply.elapsedTime),
            requestId: requestId(request),
          });
        }
      } catch (err) {
        request.log.warn({ err, msg: "request logging failed" });
      }
    }
    return payload;
  });

  app.register(healthRoutes);
  app.register(capabilityRoutes);
  app.register(authRoutes);
  app.register(aiRoutes);
  app.register(connectionRoutes);
  app.register(eventRoutes);
  app.register(webhookRoutes);
  app.register(workflowRoutes);
  app.register(developerRoutes);

  return app;
}
