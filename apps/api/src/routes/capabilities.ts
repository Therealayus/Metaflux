import { CapabilityRegistry, DEFAULT_CAPABILITIES, PermissionRegistry, DEFAULT_PERMISSIONS } from "@socialflux/meta";
import type { FastifyInstance } from "fastify";
import { requestId } from "../tenant.js";

export async function capabilityRoutes(app: FastifyInstance) {
  const caps = new CapabilityRegistry(DEFAULT_CAPABILITIES);
  const perms = new PermissionRegistry(DEFAULT_PERMISSIONS);

  app.get("/api/v1/capabilities", async (request, reply) => {
    return reply.send({ data: caps.list(), requestId: requestId(request) });
  });

  app.get("/api/v1/permissions", async (request, reply) => {
    return reply.send({ data: perms.list(), requestId: requestId(request) });
  });
}
