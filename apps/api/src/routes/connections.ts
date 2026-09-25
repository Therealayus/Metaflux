import {
  CapabilityRegistry,
  DEFAULT_CAPABILITIES,
  MetaApiClient,
  MetaApiVersionRegistry,
  buildAssetGraph,
  buildOAuthUrl,
  checkConnectionHealth,
  debugToken,
  discoverFacebookPages,
  discoverWhatsAppAssets,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  signState,
  subscribePageWebhooks,
  verifyState,
} from "@socialflux/meta";
import { decryptToken, encryptToken } from "@socialflux/security";
import { requireScope } from "@socialflux/auth";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getStore } from "@socialflux/database";
import { requestId, requireTenant, sendError } from "../tenant.js";

const PRODUCT_SCOPES: Record<string, string[]> = (() => {
  const reg = new CapabilityRegistry(DEFAULT_CAPABILITIES);
  const map: Record<string, string[]> = {};
  for (const cap of reg.list()) {
    map[cap.product] = [...new Set([...(map[cap.product] ?? []), ...cap.requiredPermissions])];
  }
  return map;
})();

const VALID_PRODUCTS = ["instagram", "whatsapp", "facebook"];

function tokenKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw Object.assign(new Error("Token encryption is not configured"), { status: 500 });
  return key;
}

function metaConfig() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw Object.assign(new Error("Meta app credentials are not configured"), { status: 500 });
  return {
    appId,
    appSecret,
    version: process.env.META_GRAPH_API_VERSION ?? "v21.0",
    redirectUri: process.env.META_OAUTH_REDIRECT_URL ?? "http://localhost:4000/api/v1/connections/meta/callback",
  };
}

function stateSecret(): string {
  return process.env.META_OAUTH_STATE_SECRET ?? process.env.AUTH_SECRET ?? "dev-only-state-secret";
}

export async function connectionRoutes(app: FastifyInstance) {
  const store = await getStore();
  const versions = MetaApiVersionRegistry.fromEnv(process.env.META_GRAPH_API_VERSION ?? "v21.0");

  // --- OAuth start: returns the Meta consent URL (frontend redirects the user) ---
  app.get("/api/v1/connections/meta/start", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireScope(await requireTenant(request), "assets:read");
    const q = request.query as { product?: string; workspaceId?: string };
    if (!q.product || !VALID_PRODUCTS.includes(q.product)) {
      return sendError(reply, 400, "invalid_product", "product must be instagram, whatsapp or facebook", reqId);
    }
    const workspaceId = q.workspaceId ?? ctx.workspaceId;
    if (!workspaceId) return sendError(reply, 400, "workspace_required", "workspaceId is required", reqId);
    const ws = await store.getWorkspace(workspaceId, ctx.organizationId);
    if (!ws) return sendError(reply, 404, "workspace_not_found", "Workspace not found", reqId);

    const cfg = metaConfig();
    const state = signState({ org: ctx.organizationId, ws: workspaceId, product: q.product }, stateSecret());
    const url = buildOAuthUrl(
      { appId: cfg.appId, redirectUri: cfg.redirectUri, scopes: PRODUCT_SCOPES[q.product] ?? [], state },
      cfg.version,
    );
    return reply.send({ data: { url, state }, requestId: reqId });
  });

  // --- OAuth callback: Meta redirects here (unauthenticated; tenant comes from signed state) ---
  app.get("/api/v1/connections/meta/callback", async (request, reply) => {
    const q = request.query as { code?: string; state?: string; error?: string; error_description?: string };
    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    const fail = (msg: string) => reply.redirect(`${webUrl}/connections?error=${encodeURIComponent(msg)}`);
    if (q.error) return fail(q.error_description ?? q.error);
    if (!q.code || !q.state) return fail("missing code or state");
    let state;
    try {
      state = verifyState(q.state, stateSecret());
    } catch {
      return fail("invalid state");
    }
    try {
      const cfg = metaConfig();
      const short = await exchangeCodeForToken({
        appId: cfg.appId,
        appSecret: cfg.appSecret,
        redirectUri: cfg.redirectUri,
        code: q.code,
        version: cfg.version,
      });
      const long = await exchangeForLongLivedToken({
        appId: cfg.appId,
        appSecret: cfg.appSecret,
        shortLivedToken: short.access_token,
        version: cfg.version,
      });
      const client = new MetaApiClient(cfg.version);
      const me = await client.request<{ id: string }>({
        method: "GET",
        path: "/me",
        accessToken: long.access_token,
        params: { fields: "id" },
      });
      const conn = await store.upsertConnection({
        organizationId: state.org,
        workspaceId: state.ws,
        product: state.product,
        status: "connected",
        scopes: PRODUCT_SCOPES[state.product] ?? [],
        encryptedToken: encryptToken(long.access_token, tokenKey()),
        tokenExpiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null,
        metaUserId: me.data.id,
      });
      await store.audit(state.org, null, "meta.connection.connected", conn.id);
      return reply.redirect(`${webUrl}/connections?connected=${state.product}`);
    } catch (err) {
      request.log.error({ err, msg: "oauth callback failed" });
      return fail(err instanceof Error ? err.message : "connection failed");
    }
  });

  // --- List connections (tokens never leave the server) ---
  app.get("/api/v1/connections", async (request, reply) => {
    const ctx = requireScope(await requireTenant(request), "assets:read");
    const q = request.query as { workspaceId?: string };
    const conns = await store.listConnections(ctx.organizationId, q.workspaceId);
    const assets = await store.listAssets(ctx.organizationId, q.workspaceId);
    return reply.send({
      data: conns.map((c) => ({
        id: c.id,
        product: c.product,
        workspaceId: c.workspaceId,
        status: c.status,
        scopes: c.scopes,
        webhookStatus: c.webhookStatus,
        lastEventAt: c.lastEventAt,
        lastHealthAt: c.lastHealthAt,
        assetCount: assets.filter((a) => a.connectionId === c.id).length,
      })),
      requestId: requestId(request),
    });
  });

  // --- Connection detail + assets ---
  app.get("/api/v1/connections/:id", async (request, reply) => {
    const ctx = requireScope(await requireTenant(request), "assets:read");
    const { id } = request.params as { id: string };
    const conn = await store.getConnection(id, ctx.organizationId);
    if (!conn) return sendError(reply, 404, "not_found", "Connection not found", requestId(request));
    const assets = await store.listAssets(ctx.organizationId);
    const { encryptedToken: _t, ...safe } = conn;
    return reply.send({
      data: { ...safe, assets: assets.filter((a) => a.connectionId === id).map(({ encryptedToken: _e, ...a }) => a) },
      requestId: requestId(request),
    });
  });

  // --- Discover assets from Meta and persist them ---
  app.post("/api/v1/connections/:id/discover", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireScope(await requireTenant(request), "workflows:write");
    const { id } = request.params as { id: string };
    const conn = await store.getConnection(id, ctx.organizationId);
    if (!conn) return sendError(reply, 404, "not_found", "Connection not found", reqId);
    if (!conn.encryptedToken) return sendError(reply, 409, "no_token", "Connection has no token — reconnect it", reqId);
    try {
      const cfg = metaConfig();
      const client = new MetaApiClient(cfg.version);
      const token = decryptToken(conn.encryptedToken, tokenKey());
      const [pagesRes, wabaRes] = await Promise.allSettled([
        discoverFacebookPages(client, token),
        discoverWhatsAppAssets(client, token),
      ]);
      // One source failing (e.g. token lacks business_management for the
      // /me/businesses call) must not discard the other source's results.
      const warnings: Array<{ source: string; message: string }> = [];
      const found: Awaited<ReturnType<typeof discoverFacebookPages>> = [];
      if (pagesRes.status === "fulfilled") found.push(...pagesRes.value);
      else warnings.push({ source: "facebook_pages", message: pagesRes.reason instanceof Error ? pagesRes.reason.message : "Pages discovery failed" });
      if (wabaRes.status === "fulfilled") found.push(...wabaRes.value);
      else warnings.push({ source: "whatsapp_assets", message: wabaRes.reason instanceof Error ? wabaRes.reason.message : "WhatsApp discovery failed" });
      const key = tokenKey();
      const saved = await store.replaceAssets(
        id,
        ctx.organizationId,
        [...found].map((a) => ({
          ...a,
          encryptedToken: a.pageAccessToken ? encryptToken(a.pageAccessToken, key) : undefined,
        })),
      );
      await store.updateConnection(id, ctx.organizationId, { status: "connected" });
      await store.audit(ctx.organizationId, ctx.userId, "meta.assets.discovered", id);
      return reply.send({
        data: { discovered: saved.length, warnings, assets: saved.map(({ encryptedToken: _e, ...a }) => a) },
        requestId: reqId,
      });
    } catch (err) {
      request.log.error({ requestId: reqId, err });
      return sendError(reply, 502, "discovery_failed", err instanceof Error ? err.message : "Discovery failed", reqId);
    }
  });

  // --- Live health check ---
  app.get("/api/v1/connections/:id/health", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireScope(await requireTenant(request), "assets:read");
    const { id } = request.params as { id: string };
    const conn = await store.getConnection(id, ctx.organizationId);
    if (!conn) return sendError(reply, 404, "not_found", "Connection not found", reqId);
    if (!conn.encryptedToken) {
      return reply.send({
        data: { state: "disconnected", token: "unknown", reason: "No token stored" },
        requestId: reqId,
      });
    }
    const cfg = process.env.META_APP_ID
      ? { appId: process.env.META_APP_ID, appSecret: process.env.META_APP_SECRET ?? "" }
      : undefined;
    const report = await checkConnectionHealth(new MetaApiClient(versions.getCurrent()), {
      accessToken: decryptToken(conn.encryptedToken, tokenKey()),
      appId: cfg?.appId,
      appSecret: cfg?.appSecret,
      requiredScopes: conn.scopes,
      webhookStatus: conn.webhookStatus ?? undefined,
      lastEventAt: conn.lastEventAt ?? undefined,
      version: versions.getCurrent(),
    });
    await store.updateConnection(id, ctx.organizationId, {
      status: report.state === "healthy" ? "connected" : report.state === "disconnected" ? "disconnected" : "action_required",
      lastHealthAt: report.checkedAt,
    });
    if (report.token === "invalid" || report.token === "expired") {
      await store.audit(ctx.organizationId, ctx.userId, "meta.connection.token_invalid", id);
    }
    return reply.send({ data: report, requestId: reqId });
  });

  // --- Subscribe pages to webhooks (real Graph call per page asset) ---
  const subscribeBody = z.object({ fields: z.array(z.string().min(1)).min(1).max(20).default(["feed", "messages"]) });
  app.post("/api/v1/connections/:id/subscribe", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireScope(await requireTenant(request), "workflows:write");
    const { id } = request.params as { id: string };
    const parsed = subscribeBody.safeParse(request.body ?? {});
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "fields array is required", reqId);
    const conn = await store.getConnection(id, ctx.organizationId);
    if (!conn) return sendError(reply, 404, "not_found", "Connection not found", reqId);
    const assets = await store.listAssets(ctx.organizationId);
    const pages = assets.filter((a) => a.connectionId === id && a.type === "facebook_page" && a.encryptedToken);
    if (pages.length === 0) {
      return sendError(reply, 409, "no_pages", "No Facebook Pages with tokens — run discovery first", reqId);
    }
    const client = new MetaApiClient(versions.getCurrent());
    const key = tokenKey();
    const results = [];
    for (const page of pages) {
      try {
        const out = await subscribePageWebhooks(client, {
          pageId: page.metaId,
          pageAccessToken: decryptToken(page.encryptedToken as string, key),
          fields: parsed.data.fields,
        });
        results.push({ page: page.metaId, success: out.success });
      } catch (err) {
        results.push({ page: page.metaId, success: false, error: err instanceof Error ? err.message : "failed" });
      }
    }
    const allOk = results.every((r) => r.success);
    await store.updateConnection(id, ctx.organizationId, { webhookStatus: allOk ? "active" : "inactive" });
    return reply.send({ data: { results, webhookStatus: allOk ? "active" : "inactive" }, requestId: reqId });
  });

  // --- Disconnect (destructive: explicit confirmation required) ---
  app.delete("/api/v1/connections/:id", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireScope(await requireTenant(request), "workflows:write");
    if (request.headers["x-confirm"] !== "true") {
      return sendError(
        reply,
        428,
        "confirmation_required",
        "Disconnecting removes tokens and stops dependent workflows. Retry with header x-confirm: true.",
        reqId,
      );
    }
    const { id } = request.params as { id: string };
    await store.deleteConnection(id, ctx.organizationId);
    await store.audit(ctx.organizationId, ctx.userId, "meta.connection.disconnected", id);
    return reply.send({ data: { deleted: true }, requestId: reqId });
  });

  // --- Asset graph for the org/workspace ---
  app.get("/api/v1/assets", async (request, reply) => {
    const ctx = requireScope(await requireTenant(request), "assets:read");
    const q = request.query as { workspaceId?: string };
    const assets = await store.listAssets(ctx.organizationId, q.workspaceId);
    const graph = buildAssetGraph(
      assets.map((a) => ({
        id: a.id,
        type: a.type as "facebook_page",
        product: a.product as "facebook",
        name: a.name,
        metaId: a.metaId,
        parentId: a.parentId ?? undefined,
        connectionId: a.connectionId,
        healthy: a.healthy,
      })),
    );
    return reply.send({ data: graph, requestId: requestId(request) });
  });

  // --- Granted scopes for a connection (debug_token-backed when configured) ---
  app.get("/api/v1/connections/:id/permissions", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireScope(await requireTenant(request), "assets:read");
    const { id } = request.params as { id: string };
    const conn = await store.getConnection(id, ctx.organizationId);
    if (!conn) return sendError(reply, 404, "not_found", "Connection not found", reqId);
    let granted: string[] = [];
    if (conn.encryptedToken && process.env.META_APP_ID && process.env.META_APP_SECRET) {
      try {
        const dbg = await debugToken({
          appId: process.env.META_APP_ID,
          appSecret: process.env.META_APP_SECRET,
          inputToken: decryptToken(conn.encryptedToken, tokenKey()),
          version: versions.getCurrent(),
        });
        granted = dbg.scopes;
      } catch (err) {
        request.log.warn({ requestId: reqId, err, msg: "debug_token failed" });
      }
    }
    return reply.send({ data: { required: conn.scopes, granted, missing: conn.scopes.filter((s) => !granted.includes(s)) }, requestId: reqId });
  });
}
