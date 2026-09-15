import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import { getStore } from "@metaflux/database";
import { metrics, routeOf } from "@metaflux/observability";
import Fastify from "fastify";
import { aiRoutes } from "./routes/ai.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { billingRoutes } from "./routes/billing.js";
import { capabilityRoutes } from "./routes/capabilities.js";
import { connectionRoutes } from "./routes/connections.js";
import { developerRoutes } from "./routes/developer.js";
import { eventRoutes } from "./routes/events.js";
import { healthRoutes } from "./routes/health.js";
import { opsRoutes } from "./routes/ops.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import { workflowRoutes } from "./routes/workflows.js";
import { requestId, resolveTenant } from "./tenant.js";

const SKIP_LOGGING = new Set(["/api/v1/health", "/api/v1/metrics", "/api/v1/live", "/api/v1/ready", "/live"]);

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

  // Raw-body capture for HMAC-verified webhooks (Stripe). Only routes that
  // opt in via `config: { rawBody: true }` pay the buffering cost.
  app.addHook("preParsing", async (request, _reply, payload) => {
    const config = (request.routeOptions?.config ?? {}) as { rawBody?: boolean };
    if (!config.rawBody) return payload;
    const chunks: Buffer[] = [];
    for await (const chunk of payload as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString("utf8");
    (request as unknown as { rawBodyText?: string }).rawBodyText = text;
    const { Readable } = await import("node:stream");
    return Readable.from([text]);
  });

  // Request inspector log + metrics. Runs in onSend (before the response
  // completes) so logs are durable when the client receives the response.
  app.addHook("onSend", async (request, reply, payload) => {
    const path = request.url.split("?")[0] ?? request.url;
    if (!SKIP_LOGGING.has(path)) {
      const route = routeOf(path);
      metrics.httpRequests.inc({ route, method: request.method, status: String(reply.statusCode) });
      metrics.httpLatency.observe(Math.round(reply.elapsedTime), { route });
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
  app.register(opsRoutes);
  app.register(adminRoutes);
  app.register(capabilityRoutes);
  app.register(authRoutes);
  app.register(billingRoutes);
  app.register(aiRoutes);
  app.register(connectionRoutes);
  app.register(eventRoutes);
  app.register(webhookRoutes);
  app.register(workspaceRoutes);
  app.register(workflowRoutes);
  app.register(developerRoutes);

  return app;
}
