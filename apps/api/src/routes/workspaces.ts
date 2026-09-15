import { requireRole } from "@metaflux/auth";
import { getStore } from "@metaflux/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requestId, requireTenant, sendError } from "../tenant.js";

const createBody = z.object({ name: z.string().min(1).max(80) });

export async function workspaceRoutes(app: FastifyInstance) {
  const store = await getStore();

  app.get("/api/v1/workspaces", async (request, reply) => {
    const ctx = await requireTenant(request);
    return reply.send({ data: await store.listWorkspaces(ctx.organizationId), requestId: requestId(request) });
  });

  app.post("/api/v1/workspaces", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireRole(await requireTenant(request), "admin");
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Workspace name is required", reqId);
    const ws = await store.createWorkspace(ctx.organizationId, parsed.data.name);
    await store.audit(ctx.organizationId, ctx.userId, "workspace.created", ws.id);
    return reply.status(201).send({ data: ws, requestId: reqId });
  });
}
