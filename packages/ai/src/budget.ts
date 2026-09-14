import { createHash } from "node:crypto";
import { estimateCostCents } from "./providers.js";

export interface BudgetUsage {
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  requestType: string;
  model: string;
  createdAt: string;
}

export interface BudgetStore {
  record(organizationId: string, usage: BudgetUsage): Promise<void>;
  sumCostCentsSince(organizationId: string, sinceIso: string): Promise<number>;
}

/** Process-local budget store for tests. Production uses the Postgres-backed one in the API. */
export class MemoryBudgetStore implements BudgetStore {
  private rows: Array<{ org: string; usage: BudgetUsage }> = [];

  async record(org: string, usage: BudgetUsage): Promise<void> {
    this.rows.push({ org, usage });
  }

  async sumCostCentsSince(org: string, sinceIso: string): Promise<number> {
    return this.rows
      .filter((r) => r.org === org && r.usage.createdAt >= sinceIso)
      .reduce((sum, r) => sum + r.usage.costCents, 0);
  }
}

export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function monthlyBudgetCents(): number {
  const raw = process.env.AI_MONTHLY_BUDGET_CENTS ?? "500";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

/** Throws when the org already spent its monthly AI budget. Call BEFORE the LLM request. */
export async function assertBudgetAvailable(store: BudgetStore, organizationId: string): Promise<void> {
  const spent = await store.sumCostCentsSince(organizationId, monthStartIso());
  if (spent >= monthlyBudgetCents()) {
    throw Object.assign(new Error("Monthly AI budget exhausted — raise the limit or wait for next cycle"), {
      status: 429,
      code: "ai_budget_exhausted",
    });
  }
}

export function toBudgetUsage(input: {
  model: string;
  tokensIn: number;
  tokensOut: number;
  requestType: string;
  latencyMs: number;
}): BudgetUsage {
  return {
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    costCents: estimateCostCents(input.model, input.tokensIn, input.tokensOut),
    requestType: input.requestType,
    model: input.model,
    createdAt: new Date().toISOString(),
  };
}

/** Privacy-safe cache key: hash of the normalized prompt, never the prompt itself. */
export function promptCacheKey(prefix: string, prompt: string): string {
  return `${prefix}:${createHash("sha256").update(prompt.trim().toLowerCase()).digest("hex").slice(0, 32)}`;
}
