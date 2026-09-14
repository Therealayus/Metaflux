/** Plan catalog. Limits are data, never hard-coded into business logic. */

export type PlanId = "free" | "starter" | "growth" | "business" | "enterprise";

export interface PlanEntitlements {
  maxWorkspaces: number;
  maxWorkflows: number;
  /** Null = unlimited. */
  maxExecutionsPerMonth: number | null;
  maxApiRequestsPerMonth: number | null;
  maxAiSpendCentsPerMonth: number;
  maxSeats: number;
  sso: boolean;
  auditLog: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  monthlyCents: number | null;
  entitlements: PlanEntitlements;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    monthlyCents: 0,
    entitlements: {
      maxWorkspaces: 1,
      maxWorkflows: 3,
      maxExecutionsPerMonth: 1_000,
      maxApiRequestsPerMonth: 10_000,
      maxAiSpendCentsPerMonth: 100,
      maxSeats: 1,
      sso: false,
      auditLog: false,
    },
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyCents: 2900,
    entitlements: {
      maxWorkspaces: 2,
      maxWorkflows: 15,
      maxExecutionsPerMonth: 25_000,
      maxApiRequestsPerMonth: 250_000,
      maxAiSpendCentsPerMonth: 1_000,
      maxSeats: 5,
      sso: false,
      auditLog: false,
    },
  },
  growth: {
    id: "growth",
    name: "Growth",
    monthlyCents: 9900,
    entitlements: {
      maxWorkspaces: 5,
      maxWorkflows: 50,
      maxExecutionsPerMonth: 250_000,
      maxApiRequestsPerMonth: 2_500_000,
      maxAiSpendCentsPerMonth: 5_000,
      maxSeats: 25,
      sso: false,
      auditLog: true,
    },
  },
  business: {
    id: "business",
    name: "Business",
    monthlyCents: 49900,
    entitlements: {
      maxWorkspaces: 25,
      maxWorkflows: 500,
      maxExecutionsPerMonth: null,
      maxApiRequestsPerMonth: null,
      maxAiSpendCentsPerMonth: 25_000,
      maxSeats: 200,
      sso: true,
      auditLog: true,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    monthlyCents: null,
    entitlements: {
      maxWorkspaces: 1_000_000,
      maxWorkflows: 1_000_000,
      maxExecutionsPerMonth: null,
      maxApiRequestsPerMonth: null,
      maxAiSpendCentsPerMonth: 1_000_000,
      maxSeats: 1_000_000,
      sso: true,
      auditLog: true,
    },
  },
};

export function getPlan(id: string): Plan {
  const plan = (PLANS as Record<string, Plan>)[id];
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/** Canceled/trialing mapping: canceled orgs fall back to free. Everything else keeps its plan. */
export function effectivePlan(planId: string, status: string | null): Plan {
  if (status === "canceled") return PLANS.free;
  return getPlan(planId);
}

export interface LimitCheck {
  ok: boolean;
  limit: number | null;
  used: number;
  message?: string;
}

/** Pure entitlement evaluation — trivially unit-testable. */
export function checkLimit(used: number, limit: number | null, resource: string): LimitCheck {
  if (limit === null) return { ok: true, limit, used };
  if (used < limit) return { ok: true, limit, used };
  return {
    ok: false,
    limit,
    used,
    message: `${resource} limit reached (${used}/${limit} this period). Upgrade your plan to continue.`,
  };
}
