import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetStoreForTests } from "../store-prisma.js";
import { buildServer } from "../server.js";

const HEADERS = { "x-user-id": "u1", "x-org-id": "org_ai" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  process.env.STORE_DRIVER = "memory";
  process.env.AUTH_SECRET = "a".repeat(32);
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AI_MONTHLY_BUDGET_CENTS;
  __resetStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ai routes", () => {
  it("falls back to rule-based planning without LLM keys and validates output", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ai/plan",
      headers: HEADERS,
      payload: { prompt: "When someone comments PRICE, send a WhatsApp message" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.intent).toBe("comment_to_whatsapp");
    expect(res.json().data.source).toBe("fallback");
    expect(res.json().data.requiredPermissions).toContain("whatsapp_business_messaging");
  });

  it("uses the LLM when configured and records usage", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "comment_to_dm",
                summary: "Reply via DM",
                steps: [{ provider: "instagram", action: "send_dm" }],
                requiredCapabilities: [{ product: "instagram", capability: "messaging" }],
                requiredPermissions: [],
                requiredAssets: [],
                missingRequirements: [],
                confidence: 0.9,
                needsConfirmation: true,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 200, completion_tokens: 100 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ai/plan",
      headers: HEADERS,
      payload: { prompt: "When someone comments PRICE on Instagram send them a DM please" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.source).toBe("llm");
    expect(res.json().data.requiredPermissions).toContain("instagram_manage_messages");

    const usage = await app.inject({ method: "GET", url: "/api/v1/ai/usage", headers: HEADERS });
    expect(usage.json().data.spentCents).toBeGreaterThan(0);
  });

  it("rejects malformed LLM plans instead of executing them", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      (async () => jsonResponse({ choices: [{ message: { content: '{"nope":true}' } }], usage: {} })) as unknown as typeof fetch,
    );
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ai/plan",
      headers: HEADERS,
      payload: { prompt: "Do something complicated with many words here" },
    });
    expect(res.statusCode).toBe(422);
  });

  it("explains permissions with human language", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ai/explain",
      headers: HEADERS,
      payload: { permission: "instagram_manage_messages" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.why.length).toBeGreaterThan(20);
    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/ai/explain",
      headers: HEADERS,
      payload: { permission: "nope" },
    });
    expect(unknown.statusCode).toBe(404);
  });

  it("diagnoses errors with certainty levels", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ai/diagnose",
      headers: HEADERS,
      payload: { errorCode: 190, message: "Invalid OAuth access token", product: "instagram" },
    });
    expect(res.statusCode).toBe(200);
    expect(["confirmed", "probable", "unknown"]).toContain(res.json().data.certainty);
    expect(res.json().data.recommendedFix.length).toBeGreaterThan(5);
  });
});
