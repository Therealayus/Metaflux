import { describe, expect, it, vi } from "vitest";
import { MetaApiClient } from "./client.js";
import { checkConnectionHealth } from "./health.js";
import { discoverFacebookPages, discoverWhatsAppAssets, subscribePageWebhooks } from "./discovery.js";
import { debugToken, exchangeCodeForToken, exchangeForLongLivedToken, signState, verifyState } from "./oauth.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("oauth", () => {
  it("signs and verifies state, rejects tampering and expiry", () => {
    const secret = "test-secret";
    const state = signState({ org: "o1", ws: "w1", product: "instagram" }, secret);
    const payload = verifyState(state, secret);
    expect(payload.org).toBe("o1");
    expect(() => verifyState(`${state}x`, secret)).toThrow();
    expect(() => verifyState(signState({ org: "o", ws: "w", product: "p", ttlSeconds: -1 }, secret), secret)).toThrow(
      /Expired/,
    );
  });

  it("exchanges codes and upgrades to long-lived tokens", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ access_token: "tok_123", token_type: "bearer", expires_in: 3600 }));
    const short = await exchangeCodeForToken({
      appId: "a",
      appSecret: "s",
      redirectUri: "https://x/cb",
      code: "code",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(short.access_token).toBe("tok_123");
    const long = await exchangeForLongLivedToken({
      appId: "a",
      appSecret: "s",
      shortLivedToken: "tok_123",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(long.access_token).toBe("tok_123");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("debugs tokens into validity + scopes", async () => {
    const fetchFn = (async () =>
      jsonResponse({ data: { is_valid: true, scopes: ["instagram_basic"], expires_at: 9_999_999_999, app_id: "a" } })) as unknown as typeof fetch;
    const dbg = await debugToken({ appId: "a", appSecret: "s", inputToken: "t", fetchFn });
    expect(dbg.isValid).toBe(true);
    expect(dbg.scopes).toEqual(["instagram_basic"]);
  });

  it("surfaces Meta token errors honestly", async () => {
    const fetchFn = (async () =>
      jsonResponse({ error: { message: "Invalid code" } }, 400)) as unknown as typeof fetch;
    await expect(
      exchangeCodeForToken({ appId: "a", appSecret: "s", redirectUri: "u", code: "bad", fetchFn }),
    ).rejects.toThrow(/Invalid code/);
  });
});

describe("discovery", () => {
  it("discovers pages with linked IG accounts", async () => {
    const fetchFn = (async () =>
      jsonResponse({
        data: [
          { id: "p1", name: "Acme", access_token: "page_tok", instagram_business_account: { id: "ig1", username: "acme" } },
          { id: "p2", name: "Acme 2" },
        ],
      })) as unknown as typeof fetch;
    const assets = await discoverFacebookPages(new MetaApiClient("v21.0", fetchFn), "user_tok");
    expect(assets).toHaveLength(3);
    expect(assets.find((a) => a.type === "instagram_business_account")).toMatchObject({
      metaId: "ig1",
      parentMetaId: "p1",
      name: "@acme",
    });
  });

  it("discovers WABA hierarchy", async () => {
    const fetchFn = (async () =>
      jsonResponse({
        data: [
          {
            id: "b1",
            name: "Biz",
            owned_whatsapp_business_accounts: {
              data: [{ id: "w1", name: "W", phone_numbers: { data: [{ id: "ph1", display_phone_number: "+1555" }] } }],
            },
          },
        ],
      })) as unknown as typeof fetch;
    const assets = await discoverWhatsAppAssets(new MetaApiClient("v21.0", fetchFn), "tok");
    expect(assets.map((a) => a.type)).toEqual(["business", "whatsapp_business_account", "phone_number"]);
    expect(assets[2]).toMatchObject({ parentMetaId: "w1", name: "+1555" });
  });

  it("subscribes pages to webhooks", async () => {
    const fetchFn = (async () => jsonResponse({ success: true })) as unknown as typeof fetch;
    const out = await subscribePageWebhooks(new MetaApiClient("v21.0", fetchFn), {
      pageId: "p1",
      pageAccessToken: "pt",
      fields: ["feed", "messages"],
    });
    expect(out.success).toBe(true);
  });
});

describe("health", () => {
  it("reports healthy token with scope diff", async () => {
    const fetchFn = (async () =>
      jsonResponse({ data: { is_valid: true, scopes: ["a"], expires_at: 9_999_999_999 } })) as unknown as typeof fetch;
    const report = await checkConnectionHealth(new MetaApiClient("v21.0", fetchFn), {
      accessToken: "t",
      appId: "a",
      appSecret: "s",
      requiredScopes: ["a", "b"],
      webhookStatus: "active",
      fetchFn,
    });
    expect(report.token).toBe("healthy");
    expect(report.missingScopes).toEqual(["b"]);
    expect(report.state).toBe("action_required");
  });

  it("flags invalid tokens", async () => {
    const fetchFn = (async () => jsonResponse({ data: { is_valid: false, scopes: [] } })) as unknown as typeof fetch;
    const report = await checkConnectionHealth(new MetaApiClient("v21.0", fetchFn), {
      accessToken: "bad",
      appId: "a",
      appSecret: "s",
      requiredScopes: ["a"],
      fetchFn,
    });
    expect(report.token).toBe("invalid");
    expect(report.state).toBe("action_required");
  });

  it("falls back to /me probe without app credentials and never fabricates scopes", async () => {
    const fetchFn = (async () => jsonResponse({ id: "123" })) as unknown as typeof fetch;
    const report = await checkConnectionHealth(new MetaApiClient("v21.0", fetchFn), {
      accessToken: "t",
      requiredScopes: ["a"],
      fetchFn,
    });
    expect(report.token).toBe("healthy");
    expect(report.grantedScopes).toEqual([]);
    expect(report.missingScopes).toEqual(["a"]);
  });
});
