import { checkLimit, effectivePlan, type Plan } from "./plans.js";
import { monthStartIso } from "@socialflux/ai";
import type { Store } from "@socialflux/database";

export async function planFor(store: Store, organizationId: string): Promise<Plan> {
  const sub = await store.getSubscription(organizationId);
  return effectivePlan(sub?.plan ?? "free", sub?.status ?? null);
}

function limitError(message: string): Error {
  return Object.assign(new Error(message), { status: 402, code: "plan_limit" });
}

/** Workflow creation gate. */
export async function assertCanCreateWorkflow(store: Store, organizationId: string): Promise<Plan> {
  const plan = await planFor(store, organizationId);
  const used = await store.countWorkflows(organizationId);
  const check = checkLimit(used, plan.entitlements.maxWorkflows, "Workflows");
  if (!check.ok) throw limitError(check.message as string);
  return plan;
}

/** Execution gate (worker calls this before matching). */
export async function assertExecutionBudget(store: Store, organizationId: string): Promise<Plan> {
  const plan = await planFor(store, organizationId);
  const used = await store.countExecutionsSince(organizationId, monthStartIso());
  const check = checkLimit(used, plan.entitlements.maxExecutionsPerMonth, "Workflow executions");
  if (!check.ok) throw limitError(check.message as string);
  return plan;
}

/** Unified-send gate (API + explorer traffic). */
export async function assertMessageBudget(store: Store, organizationId: string): Promise<Plan> {
  const plan = await planFor(store, organizationId);
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const used = await store.countApiRequests(organizationId, since);
  const check = checkLimit(used, plan.entitlements.maxApiRequestsPerMonth, "API requests");
  if (!check.ok) throw limitError(check.message as string);
  return plan;
}

/** AI spend cap: the tighter of instance default and plan entitlement. */
export async function aiBudgetCents(store: Store, organizationId: string): Promise<number> {
  const plan = await planFor(store, organizationId);
  const envRaw = Number(process.env.AI_MONTHLY_BUDGET_CENTS ?? 500);
  const envCap = Number.isFinite(envRaw) && envRaw > 0 ? envRaw : 500;
  return Math.min(envCap, plan.entitlements.maxAiSpendCentsPerMonth);
}
