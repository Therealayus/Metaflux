import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../server.js";
import { __resetStoreForTests, getStore } from "@metaflux/database";

const ORG = "org_p1";
const HEADERS = { "x-user-id": "u1", "x-org-id": ORG };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  process.env.STORE_DRIVER = "memory";
  process.env.AUTH_SECRET = "a".repeat(32);
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.META_APP_ID = "app_1";
  process.env.META_APP_SECRET = "shh";
  process.env.META_OAUTH_REDIRECT_URL = "http://localhost:4000/api/v1/connections/meta/callback";
  process.env.WEB_URL = "http://localhost:3000";
  __resetStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function makeWorkspace() {
  const store = await getStore();
  return store.createWorkspace(ORG, "Production");
}

describe("meta connections", () => {
  it("starts OAuth with registry-derived scopes and signed state", async () => {
    const app = buildServer();
    const ws = await makeWorkspace();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/connections/meta/start?product=instagram&workspaceId=${ws.id}`,
      headers: HEADERS,
    });
    expect(res.statusCode).toBe(200);
    const { url, state } = res.json().data;
    expect(url).toContain("facebook.com");
    expect(url).toContain("instagram_manage_messages");
    expect(typeof state).toBe("string");
  });

  it("rejects unknown products and foreign workspaces", async () => {
    const app = buildServer();
    const bad = await app.inject({ method: "GET", url: "/api/v1/connections/meta/start?product=myspace", headers: HEADERS });
    expect(bad.statusCode).toBe(400);
    const foreign = await app.inject({
      method: "GET",
      url: "/api/v1/connections/meta/start?product=instagram&workspaceId=ws_nope",
      headers: HEADERS,
    });
    expect(foreign.statusCode).toBe(404);
  });

  it("completes OAuth callback, encrypts the token, and lists connections without secrets", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/oauth/access_token")) return jsonResponse({ access_token: "tok", token_type: "bearer", expires_in: 3600 });
      if (u.includes("/me")) return jsonResponse({ id: "meta_user_1" });
      throw new Error(`unexpected ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = buildServer();
    const ws = await makeWorkspace();
    const start = await app.inject({
      method: "GET",
      url: `/api/v1/connections/meta/start?product=instagram&workspaceId=${ws.id}`,
      headers: HEADERS,
    });
    const { state } = start.json().data;

    const cb = await app.inject({ method: "GET", url: `/api/v1/connections/meta/callback?code=code123&state=${state}` });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toContain("connected=instagram");

    const list = await app.inject({ method: "GET", url: "/api/v1/connections", headers: HEADERS });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(1);
    expect(JSON.stringify(list.json())).not.toContain("tok");

    // Token is stored encrypted, never raw.
    const store = await getStore();
    const conns = await store.listConnections(ORG);
    expect(conns[0]?.encryptedToken).toBeTruthy();
    expect(conns[0]?.encryptedToken).not.toContain("tok");

    // Other tenants see nothing.
    const other = await app.inject({ method: "GET", url: "/api/v1/connections", headers: { "x-user-id": "u2", "x-org-id": "org_other" } });
    expect(other.json().data).toHaveLength(0);
  });

  it("rejects forged OAuth state", async () => {
    const app = buildServer();
    const cb = await app.inject({ method: "GET", url: "/api/v1/connections/meta/callback?code=x&state=forged.payload" });
    expect(cb.statusCode).toBe(302);
    expect(decodeURIComponent(cb.headers.location ?? "")).toContain("invalid state");
  });

  it("discovers and persists the asset hierarchy", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/oauth/access_token")) return jsonResponse({ access_token: "tok", expires_in: 3600 });
      if (u.includes("/me/accounts")) {
        return jsonResponse({ data: [{ id: "p1", name: "Acme", access_token: "page_tok", instagram_business_account: { id: "ig1", username: "acme" } }] });
      }
      if (u.includes("/me/businesses")) {
        return jsonResponse({ data: [{ id: "b1", name: "Biz", owned_whatsapp_business_accounts: { data: [] } }] });
      }
      if (u.includes("/me?") || u.endsWith("/me")) return jsonResponse({ id: "meta_user_1" });
      throw new Error(`unexpected ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = buildServer();
    const ws = await makeWorkspace();
    const start = await app.inject({
      method: "GET",
      url: `/api/v1/connections/meta/start?product=facebook&workspaceId=${ws.id}`,
      headers: HEADERS,
    });
    await app.inject({ method: "GET", url: `/api/v1/connections/meta/callback?code=c&state=${start.json().data.state}` });
    const store = await getStore();
    const connId = (await store.listConnections(ORG))[0]?.id as string;

    const disc = await app.inject({ method: "POST", url: `/api/v1/connections/${connId}/discover`, headers: HEADERS });
    expect(disc.statusCode).toBe(200);
    expect(disc.json().data.discovered).toBe(3); // page + IG + business

    const graph = await app.inject({ method: "GET", url: "/api/v1/assets", headers: HEADERS });
    expect(graph.statusCode).toBe(200);
    expect(JSON.stringify(graph.json())).not.toContain("page_tok");
  });

  it("checks live health and subscribes webhooks", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/oauth/access_token")) return jsonResponse({ access_token: "tok", expires_in: 3600 });
      if (u.includes("/debug_token")) return jsonResponse({ data: { is_valid: true, scopes: ["pages_messaging"], expires_at: 9_999_999_999 } });
      if (u.includes("/me/accounts")) {
        return jsonResponse({ data: [{ id: "p1", name: "Acme", access_token: "page_tok" }] });
      }
      if (u.includes("/me/businesses")) return jsonResponse({ data: [] });
      if (u.includes("/subscribed_apps") && init?.method === "POST") return jsonResponse({ success: true });
      if (u.includes("/me")) return jsonResponse({ id: "meta_user_1" });
      throw new Error(`unexpected ${u} ${init?.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = buildServer();
    const ws = await makeWorkspace();
    const start = await app.inject({
      method: "GET",
      url: `/api/v1/connections/meta/start?product=facebook&workspaceId=${ws.id}`,
      headers: HEADERS,
    });
    await app.inject({ method: "GET", url: `/api/v1/connections/meta/callback?code=c&state=${start.json().data.state}` });
    const store = await getStore();
    const connId = (await store.listConnections(ORG))[0]?.id as string;
    await app.inject({ method: "POST", url: `/api/v1/connections/${connId}/discover`, headers: HEADERS });

    const health = await app.inject({ method: "GET", url: `/api/v1/connections/${connId}/health`, headers: HEADERS });
    expect(health.statusCode).toBe(200);
    expect(health.json().data.token).toBe("healthy");

    const sub = await app.inject({ method: "POST", url: `/api/v1/connections/${connId}/subscribe`, headers: HEADERS, payload: { fields: ["feed"] } });
    expect(sub.statusCode).toBe(200);
    expect(sub.json().data.webhookStatus).toBe("active");
  });

  it("requires explicit confirmation for disconnect", async () => {
    const app = buildServer();
    const store = await getStore();
    const ws = await store.createWorkspace(ORG, "W");
    const conn = await store.upsertConnection({
      organizationId: ORG,
      workspaceId: ws.id,
      product: "instagram",
      status: "connected",
      scopes: [],
      encryptedToken: "x",
      tokenExpiresAt: null,
      metaUserId: null,
    });
    const noConfirm = await app.inject({ method: "DELETE", url: `/api/v1/connections/${conn.id}`, headers: HEADERS });
    expect(noConfirm.statusCode).toBe(428);
    const yes = await app.inject({
      method: "DELETE",
      url: `/api/v1/connections/${conn.id}`,
      headers: { ...HEADERS, "x-confirm": "true" },
    });
    expect(yes.statusCode).toBe(200);
    expect(await store.getConnection(conn.id, ORG)).toBeNull();
  });
});
