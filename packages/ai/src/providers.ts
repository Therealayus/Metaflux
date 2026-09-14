/**
 * Provider-neutral LLM layer. Keys stay server-side; prompts are never logged
 * (only lengths and model names for cost observability).
 */

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface ChatResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export interface ChatProvider {
  readonly name: string;
  chat(messages: ChatMessage[], opts?: { maxTokens?: number; jsonMode?: boolean; model?: string }): Promise<ChatResult>;
}

/** Cost per 1K tokens in USD cents (input, output). Update as providers change pricing. */
export const MODEL_COSTS_CENTS: Record<string, [number, number]> = {
  "gpt-4o-mini": [0.015, 0.06],
  "gpt-4o": [0.25, 1.0],
  "claude-3-5-haiku": [0.08, 0.4],
  "claude-3-5-sonnet": [0.3, 1.5],
};

export function estimateCostCents(model: string, tokensIn: number, tokensOut: number): number {
  const [cin, cout] = MODEL_COSTS_CENTS[model] ?? [0.1, 0.3];
  return (tokensIn / 1000) * cin + (tokensOut / 1000) * cout;
}

/** Rough token estimate for budgeting before a call (~4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

const PLAN_SYSTEM = `You are MetaFlux's integration planner. Convert the user's business goal into a JSON execution plan.
Only use these products: instagram, whatsapp, facebook, meta.
Only use these capabilities: instagram:comments, instagram:messaging, instagram:insights, whatsapp:messaging, facebook:comments, facebook:messaging.
Respond with JSON only, matching this schema:
{"intent": string, "summary": string, "steps": [{"provider": string, "action": string, "label"?: string}], "requiredCapabilities": [{"product": string, "capability": string}], "requiredPermissions": [], "requiredAssets": [], "missingRequirements": [], "confidence": number, "needsConfirmation": true}`;

/** OpenAI-compatible chat API (OpenAI + any compatible gateway). Real HTTPS. */
export class OpenAICompatibleProvider implements ChatProvider {
  readonly name = "openai-compatible";

  constructor(
    private opts: { apiKey: string; baseUrl?: string; defaultModel?: string; fetchFn?: typeof fetch },
  ) {}

  async chat(messages: ChatMessage[], callOpts?: { maxTokens?: number; jsonMode?: boolean; model?: string }): Promise<ChatResult> {
    const model = callOpts?.model ?? this.opts.defaultModel ?? "gpt-4o-mini";
    const res = await (this.opts.fetchFn ?? fetch)(`${this.opts.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: callOpts?.maxTokens ?? 800,
        ...(callOpts?.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(data.error?.message ?? `LLM request failed (${res.status})`);
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("LLM returned an empty response");
    return {
      text,
      model,
      tokensIn: data.usage?.prompt_tokens ?? estimateTokens(messages.map((m) => m.content).join("")),
      tokensOut: data.usage?.completion_tokens ?? estimateTokens(text),
    };
  }
}

/** Anthropic Messages API. Real HTTPS. */
export class AnthropicProvider implements ChatProvider {
  readonly name = "anthropic";

  constructor(private opts: { apiKey: string; defaultModel?: string; fetchFn?: typeof fetch }) {}

  async chat(messages: ChatMessage[], callOpts?: { maxTokens?: number; model?: string }): Promise<ChatResult> {
    const model = callOpts?.model ?? this.opts.defaultModel ?? "claude-3-5-haiku";
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const rest = messages.filter((m) => m.role !== "system");
    const res = await (this.opts.fetchFn ?? fetch)("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.opts.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: callOpts?.maxTokens ?? 800,
        system: system || undefined,
        messages: rest.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      content?: Array<{ text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(data.error?.message ?? `LLM request failed (${res.status})`);
    const text = data.content?.map((c) => c.text ?? "").join("") ?? "";
    if (!text) throw new Error("LLM returned an empty response");
    return {
      text,
      model,
      tokensIn: data.usage?.input_tokens ?? estimateTokens(messages.map((m) => m.content).join("")),
      tokensOut: data.usage?.output_tokens ?? estimateTokens(text),
    };
  }
}

/** Simple requests → cheap model; planning/diagnosis → stronger model. */
export function routeModel(task: "plan" | "diagnose" | "explain" | "summarize", promptLength: number): "cheap" | "strong" {
  if (task === "plan" || task === "diagnose") return "strong";
  if (promptLength > 1500) return "strong";
  return "cheap";
}

export interface LlmClients {
  cheap?: ChatProvider;
  strong?: ChatProvider;
}

/** Build providers from env. Missing keys → undefined (caller falls back to rules). */
export function providersFromEnv(fetchFn?: typeof fetch): LlmClients {
  const out: LlmClients = {};
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const p = new OpenAICompatibleProvider({
      apiKey: openaiKey,
      baseUrl: process.env.OPENAI_BASE_URL,
      defaultModel: process.env.AI_CHEAP_MODEL ?? "gpt-4o-mini",
      fetchFn,
    });
    out.cheap = p;
    if (!process.env.ANTHROPIC_API_KEY) {
      out.strong = new OpenAICompatibleProvider({
        apiKey: openaiKey,
        baseUrl: process.env.OPENAI_BASE_URL,
        defaultModel: process.env.AI_STRONG_MODEL ?? "gpt-4o",
        fetchFn,
      });
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    out.strong =
      process.env.AI_STRONG_MODEL?.startsWith("claude") || !out.strong
        ? new AnthropicProvider({
            apiKey: process.env.ANTHROPIC_API_KEY,
            defaultModel: process.env.AI_STRONG_MODEL ?? "claude-3-5-sonnet",
            fetchFn,
          })
        : out.strong;
  }
  return out;
}

/** Ask an LLM for a raw plan object. Caller MUST pass it through validatePlan(). */
export async function llmGeneratePlanRaw(
  provider: ChatProvider,
  prompt: string,
  model?: string,
): Promise<{ raw: unknown; usage: ChatResult }> {
  const result = await provider.chat(
    [
      { role: "system", content: PLAN_SYSTEM },
      { role: "user", content: prompt },
    ],
    { jsonMode: true, model },
  );
  let raw: unknown;
  try {
    raw = JSON.parse(result.text);
  } catch {
    throw new Error("LLM returned malformed JSON plan");
  }
  return { raw, usage: result };
}
