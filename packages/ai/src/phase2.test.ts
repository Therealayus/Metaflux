import { describe, expect, it, vi } from "vitest";
import {
  AnthropicProvider,
  MemoryBudgetStore,
  OpenAICompatibleProvider,
  assertBudgetAvailable,
  buildDiagnosis,
  estimateCostCents,
  estimateTokens,
  llmGeneratePlanRaw,
  promptCacheKey,
  routeModel,
  toBudgetUsage,
} from "./index.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("llm providers", () => {
  it("calls OpenAI-compatible chat and parses usage", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: '{"intent":"x"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
    );
    const p = new OpenAICompatibleProvider({ apiKey: "k", fetchFn: fetchFn as unknown as typeof fetch });
    const out = await p.chat([{ role: "user", content: "hi" }], { jsonMode: true });
    expect(out.text).toBe('{"intent":"x"}');
    expect(out.tokensIn).toBe(100);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [, init] = (fetchFn.mock.calls[0] as unknown) as [string, RequestInit];
    expect(JSON.parse(init.body as string).response_format).toEqual({ type: "json_object" });
  });

  it("calls Anthropic messages api", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ content: [{ text: "hello" }], usage: { input_tokens: 10, output_tokens: 5 } }),
    );
    const p = new AnthropicProvider({ apiKey: "k", fetchFn: fetchFn as unknown as typeof fetch });
    const out = await p.chat([
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ]);
    expect(out.text).toBe("hello");
    const [, init] = (fetchFn.mock.calls[0] as unknown) as [string, RequestInit];
    expect(JSON.parse(init.body as string).system).toBe("sys");
  });

  it("surfaces provider errors and empty responses honestly", async () => {
    const errFn = (async () => jsonResponse({ error: { message: "bad key" } }, 401)) as unknown as typeof fetch;
    await expect(
      new OpenAICompatibleProvider({ apiKey: "bad", fetchFn: errFn }).chat([{ role: "user", content: "x" }]),
    ).rejects.toThrow(/bad key/);
    const emptyFn = (async () => jsonResponse({ choices: [{ message: {} }] })) as unknown as typeof fetch;
    await expect(
      new OpenAICompatibleProvider({ apiKey: "k", fetchFn: emptyFn }).chat([{ role: "user", content: "x" }]),
    ).rejects.toThrow(/empty response/);
  });

  it("parses LLM plans as JSON and rejects malformed output", async () => {
    const good = new OpenAICompatibleProvider({
      apiKey: "k",
      fetchFn: (async () =>
        jsonResponse({ choices: [{ message: { content: '{"intent":"a"}' } }], usage: {} })) as unknown as typeof fetch,
    });
    const { raw } = await llmGeneratePlanRaw(good, "do things");
    expect(raw).toEqual({ intent: "a" });

    const bad = new OpenAICompatibleProvider({
      apiKey: "k",
      fetchFn: (async () =>
        jsonResponse({ choices: [{ message: { content: "not json" } }], usage: {} })) as unknown as typeof fetch,
    });
    await expect(llmGeneratePlanRaw(bad, "do things")).rejects.toThrow(/malformed JSON/);
  });

  it("routes complex tasks to strong models", () => {
    expect(routeModel("plan", 10)).toBe("strong");
    expect(routeModel("diagnose", 10)).toBe("strong");
    expect(routeModel("explain", 10)).toBe("cheap");
    expect(routeModel("explain", 5000)).toBe("strong");
  });
});

describe("budgets", () => {
  it("estimates cost and enforces monthly caps", async () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateCostCents("gpt-4o-mini", 1000, 1000)).toBeCloseTo(0.075);
    const store = new MemoryBudgetStore();
    process.env.AI_MONTHLY_BUDGET_CENTS = "10";
    await assertBudgetAvailable(store, "o1");
    await store.record("o1", toBudgetUsage({ model: "gpt-4o", tokensIn: 100_000, tokensOut: 0, requestType: "plan", latencyMs: 1 }));
    await expect(assertBudgetAvailable(store, "o1")).rejects.toMatchObject({ code: "ai_budget_exhausted" });
    delete process.env.AI_MONTHLY_BUDGET_CENTS;
  });

  it("hashes prompts for cache keys without storing them", () => {
    const a = promptCacheKey("plan", "  Hello World ");
    const b = promptCacheKey("plan", "hello world");
    expect(a).toBe(b);
    expect(a).not.toContain("hello");
  });
});

describe("diagnosis", () => {
  it("marks token failures confirmed when the token state is observed", () => {
    const d = buildDiagnosis({
      error: { category: "oauth", headline: "Token invalid", probableCause: "Token expired", recommendedFix: "Reconnect", retryable: false },
      evidence: { tokenState: "expired", connectionStatus: "action_required" },
      impactedWorkflows: 2,
    });
    expect(d.certainty).toBe("confirmed");
    expect(d.impact).toContain("2 workflow(s)");
    expect(d.action?.label).toBe("Fix connection");
  });

  it("marks permission failures confirmed when scopes are provably missing", () => {
    const d = buildDiagnosis({
      error: { category: "permission", headline: "Missing", probableCause: "Scope gone", recommendedFix: "Reconnect", retryable: false },
      evidence: { missingScopes: ["pages_messaging"] },
    });
    expect(d.certainty).toBe("confirmed");
  });

  it("stays probable without direct proof, unknown without errors", () => {
    const probable = buildDiagnosis({
      error: { category: "rate_limit", headline: "Limited", probableCause: "Too fast", recommendedFix: "Back off", retryable: true },
    });
    expect(probable.certainty).toBe("probable");
    const unknown = buildDiagnosis({});
    expect(unknown.certainty).toBe("unknown");
  });
});
