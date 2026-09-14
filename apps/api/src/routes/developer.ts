import { createHash } from "node:crypto";
import { newApiKey, requireScope, requireSession } from "@metaflux/auth";
import { getStore } from "@metaflux/database";
import { MetaApiClient, parseChannel, resolveSender } from "@metaflux/meta";
import { decryptToken } from "@metaflux/security";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requestId, requireTenant, sendError } from "../tenant.js";
import { assertMessageBudget } from "@metaflux/billing";

const AVAILABLE_SCOPES = ["messages:send", "events:read", "workflows:read", "workflows:write", "leads:read", "assets:read", "ai:use"];

const createKeyBody = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.string()).min(1).max(AVAILABLE_SCOPES.length),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function developerRoutes(app: FastifyInstance) {
  const store = await getStore();

  // --- API keys (human sessions only) ---
  app.get("/api/v1/developer/scopes", async (request, reply) => {
    await requireTenant(request);
    return reply.send({ data: AVAILABLE_SCOPES, requestId: requestId(request) });
  });

  app.post("/api/v1/keys", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireSession(await requireTenant(request));
    const parsed = createKeyBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "name and scopes are required", reqId);
    const unknown = parsed.data.scopes.filter((s) => !AVAILABLE_SCOPES.includes(s));
    if (unknown.length > 0) return sendError(reply, 400, "invalid_scope", `Unknown scopes: ${unknown.join(", ")}`, reqId);
    const env = process.env.NODE_ENV === "production" ? "live" : "test";
    const { raw, prefix } = newApiKey(env);
    const rec = await store.createApiKey({
      organizationId: ctx.organizationId,
      name: parsed.data.name,
      prefix,
      keyHash: hashKey(raw),
      scopes: parsed.data.scopes,
      expiresAt: parsed.data.expiresInDays ? new Date(Date.now() + parsed.data.expiresInDays * 86400_000).toISOString() : null,
    });
    await store.audit(ctx.organizationId, ctx.userId, "apikey.created", rec.id);
    const { keyHash: _h, ...safe } = rec;
    // Raw key returned exactly once — never stored, never shown again.
    return reply.status(201).send({ data: { ...safe, key: raw }, requestId: reqId });
  });

  app.get("/api/v1/keys", async (request, reply) => {
    const ctx = requireSession(await requireTenant(request));
    return reply.send({ data: await store.listApiKeys(ctx.organizationId), requestId: requestId(request) });
  });

  app.post("/api/v1/keys/:id/revoke", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireSession(await requireTenant(request));
    const { id } = request.params as { id: string };
    await store.revokeApiKey(id, ctx.organizationId);
    await store.audit(ctx.organizationId, ctx.userId, "apikey.revoked", id);
    return reply.send({ data: { revoked: true }, requestId: reqId });
  });

  // --- Request logs ---
  app.get("/api/v1/requests", async (request, reply) => {
    const ctx = requireScope(await requireTenant(request), "events:read");
    const q = request.query as { keyId?: string; status?: string; cursor?: string; limit?: string };
    const listed = await store.listApiRequests(ctx.organizationId, {
      keyId: q.keyId,
      status: q.status !== undefined ? Number(q.status) : undefined,
      cursor: q.cursor,
      limit: q.limit ? Number(q.limit) : undefined,
    });
    return reply.send({ data: listed.items, nextCursor: listed.nextCursor, requestId: requestId(request) });
  });

  app.get("/api/v1/requests/:id", async (request, reply) => {
    const ctx = requireScope(await requireTenant(request), "events:read");
    const { id } = request.params as { id: string };
    const rec = await store.getApiRequest(id, ctx.organizationId);
    if (!rec) return sendError(reply, 404, "not_found", "Request not found", requestId(request));
    return reply.send({ data: rec, requestId: requestId(request) });
  });

  // --- Unified send: POST /v1/messages (the API-explorer signature endpoint) ---
  const sendBody = z.object({
    channel: z.string(),
    recipient: z.string().min(1).max(64),
    message: z.string().min(1).max(4096),
    idempotencyKey: z.string().min(1).max(128).optional(),
    workspaceId: z.string().optional(),
  });

  app.post("/api/v1/messages", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireScope(await requireTenant(request), "messages:send");
    const parsed = sendBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "channel, recipient and message are required", reqId);
    const workspaceId = parsed.data.workspaceId ?? ctx.workspaceId;
    if (!workspaceId) return sendError(reply, 400, "workspace_required", "workspaceId is required", reqId);
    const ws = await store.getWorkspace(workspaceId, ctx.organizationId);
    if (!ws) return sendError(reply, 404, "workspace_not_found", "Workspace not found", reqId);
    let channel;
    try {
      channel = parseChannel(parsed.data.channel);
    } catch (err) {
      return sendError(reply, 400, "invalid_channel", err instanceof Error ? err.message : "bad channel", reqId);
    }
    try {
      await assertMessageBudget(store, ctx.organizationId);
      const key = process.env.TOKEN_ENCRYPTION_KEY;
      if (!key) throw Object.assign(new Error("Token encryption is not configured"), { status: 500 });
      const connections = await store.listConnections(ctx.organizationId, workspaceId);
      const assets = await store.listAssets(ctx.organizationId, workspaceId);
      const { provider, connectionId } = resolveSender({
        channel,
        connections: connections.map((c) => ({ id: c.id, product: c.product, encryptedToken: c.encryptedToken })),
        assets: assets.map((a) => ({ connectionId: a.connectionId, type: a.type, metaId: a.metaId, encryptedToken: a.encryptedToken })),
        decrypt: (ciphertext) => decryptToken(ciphertext, key),
        client: new MetaApiClient(process.env.META_GRAPH_API_VERSION ?? "v21.0"),
      });
      const started = Date.now();
      const result = await provider.sendMessage({
        channel,
        recipient: parsed.data.recipient,
        text: parsed.data.message,
        idempotencyKey: parsed.data.idempotencyKey ?? `api:${reqId}`,
      });
      await store.audit(ctx.organizationId, ctx.userId, "message.sent", connectionId);
      return reply.status(201).send({
        data: {
          providerMessageId: result.providerMessageId,
          channel,
          status: result.status,
          latencyMs: Date.now() - started,
          provider: "meta",
          apiVersion: process.env.META_GRAPH_API_VERSION ?? "v21.0",
        },
        requestId: reqId,
      });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 502;
      const code = (err as { code?: string }).code ?? "send_failed";
      return sendError(reply, status, code, err instanceof Error ? err.message : "Send failed", reqId);
    }
  });

  // --- Usage summary ---
  app.get("/api/v1/usage", async (request, reply) => {
    const ctx = await requireTenant(request);
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [apiRequests, aiSpend] = await Promise.all([
      store.countApiRequests(ctx.organizationId, since),
      store.sumAiUsageCostSince(ctx.organizationId, since),
    ]);
    return reply.send({
      data: {
        periodDays: 30,
        apiRequests,
        aiSpendCents: Math.round(aiSpend * 100) / 100,
      },
      requestId: requestId(request),
    });
  });
}
