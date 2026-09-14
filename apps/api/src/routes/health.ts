import type { FastifyInstance } from "fastify";
import { requireTenant, requestId } from "../tenant.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/api/v1/health", async (request, reply) => {
    const reqId = requestId(request);
    return reply.send({ data: { status: "ok", version: "0.1.0" }, requestId: reqId });
  });

  app.get("/api/v1/health/connections", async (request, reply) => {
    const ctx = requireTenant(request);
    // Foundation: no connections yet — honest empty state, never fake data.
    return reply.send({
      data: { organizationId: ctx.organizationId, connections: [], message: "No Meta connections yet." },
      requestId: requestId(request),
    });
  });
}
