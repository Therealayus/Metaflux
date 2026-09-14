import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { aiRoutes } from "./routes/ai.js";
import { capabilityRoutes } from "./routes/capabilities.js";
import { connectionRoutes } from "./routes/connections.js";
import { eventRoutes } from "./routes/events.js";
import { healthRoutes } from "./routes/health.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { workflowRoutes } from "./routes/workflows.js";
import { requestId } from "./tenant.js";

export function buildServer() {
  const app = Fastify({ logger: true, genReqId: () => requestId({ headers: {} } as never) });

  app.register(fastifyHelmet, { contentSecurityPolicy: false });
  app.register(fastifyCors, { origin: process.env.WEB_URL ?? "http://localhost:3000", credentials: true });
  app.register(fastifyCookie);
  app.register(fastifyRateLimit, { max: 300, timeWindow: "1 minute" });

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

  app.register(healthRoutes);
  app.register(capabilityRoutes);
  app.register(aiRoutes);
  app.register(connectionRoutes);
  app.register(eventRoutes);
  app.register(webhookRoutes);
  app.register(workflowRoutes);

  return app;
}
