import type { NormalizedMetaError } from "@metaflux/meta";

export type Certainty = "confirmed" | "probable" | "unknown";

export interface ConnectionEvidence {
  connectionStatus?: string;
  tokenState?: string;
  missingScopes?: string[];
  webhookStatus?: string;
  lastEventAt?: string;
  recentErrorCount?: number;
}

export interface Diagnosis {
  rootCause: string;
  certainty: Certainty;
  evidence: string[];
  impact: string;
  recommendedFix: string;
  action?: { label: string; href: string };
}

/**
 * Deterministic diagnosis from normalized errors + live connection evidence.
 * The LLM may add narrative on top, but certainty levels come from here —
 * the AI never fabricates a "confirmed" cause.
 */
export function buildDiagnosis(input: {
  error?: Pick<NormalizedMetaError, "category" | "headline" | "probableCause" | "recommendedFix" | "retryable">;
  evidence?: ConnectionEvidence;
  impactedWorkflows?: number;
}): Diagnosis {
  const evidence: string[] = [];
  const ev = input.evidence ?? {};
  if (ev.connectionStatus) evidence.push(`Connection status: ${ev.connectionStatus}`);
  if (ev.tokenState) evidence.push(`Token state: ${ev.tokenState}`);
  if (ev.missingScopes?.length) evidence.push(`Missing scopes: ${ev.missingScopes.join(", ")}`);
  if (ev.webhookStatus) evidence.push(`Webhook: ${ev.webhookStatus}`);
  if (ev.lastEventAt) evidence.push(`Last event: ${ev.lastEventAt}`);
  if (typeof ev.recentErrorCount === "number") evidence.push(`Recent errors: ${ev.recentErrorCount}`);

  const impact =
    (input.impactedWorkflows ?? 0) > 0
      ? `${input.impactedWorkflows} workflow(s) may be missing events or failing actions.`
      : "No active workflows are impacted right now.";

  if (!input.error) {
    return {
      rootCause: "No errors observed recently — nothing to diagnose.",
      certainty: "unknown",
      evidence,
      impact,
      recommendedFix: "If automations misbehave, check connection health and recent events.",
    };
  }

  const { category, headline, probableCause, recommendedFix, retryable } = input.error;

  // Confirmed: token state directly observed, or scopes provably missing.
  if ((category === "oauth" && ev.tokenState && ["invalid", "expired"].includes(ev.tokenState)) || (category === "permission" && (ev.missingScopes?.length ?? 0) > 0)) {
    return {
      rootCause: probableCause,
      certainty: "confirmed",
      evidence,
      impact,
      recommendedFix,
      action: { label: "Fix connection", href: "/connections" },
    };
  }

  // Probable: category known, direct proof absent.
  if (!retryable) {
    return {
      rootCause: `${headline}. ${probableCause}`,
      certainty: "probable",
      evidence,
      impact,
      recommendedFix,
      action: { label: "Open health", href: "/health" },
    };
  }

  return {
    rootCause: `${headline}. ${probableCause}`,
    certainty: retryable ? "probable" : "unknown",
    evidence,
    impact,
    recommendedFix: "MetaFlux retries automatically. If it persists, inspect the connection and event history.",
  };
}
