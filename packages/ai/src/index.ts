import { z } from "zod";
import { CapabilityRegistry, DEFAULT_CAPABILITIES } from "@metaflux/meta";

/** Structured plan the LLM must produce. Validation engine enforces this schema. */
export const planStepSchema = z.object({
  provider: z.string(),
  action: z.string(),
  label: z.string().optional(),
});

export const executionPlanSchema = z.object({
  intent: z.string(),
  summary: z.string(),
  steps: z.array(planStepSchema).min(1),
  requiredCapabilities: z.array(z.object({ product: z.string(), capability: z.string() })),
  requiredPermissions: z.array(z.string()),
  requiredAssets: z.array(z.string()),
  missingRequirements: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean().default(false),
});

export type ExecutionPlan = z.infer<typeof executionPlanSchema>;

export interface AIProvider {
  readonly name: string;
  generatePlan(prompt: string): Promise<unknown>;
  diagnoseError(input: { headline: string; detail: string }): Promise<string>;
}

/**
 * Deterministic rule-based planner used for local dev/test and as a fallback.
 * Production wires an LLM-backed AIProvider; output ALWAYS goes through validatePlan().
 */
export class RuleBasedPlanner implements AIProvider {
  readonly name = "rule-based";

  async generatePlan(prompt: string): Promise<unknown> {
    const p = prompt.toLowerCase();
    const wantsIgComments = /comment|instagram/.test(p);
    const wantsWhatsapp = /whatsapp/.test(p);
    const wantsDm = /\bdm\b|direct message|message/.test(p);
    const steps: Array<{ provider: string; action: string; label?: string }> = [];
    if (wantsIgComments) steps.push({ provider: "instagram", action: "listen_for_comment", label: "Listen for Instagram comment" });
    if (wantsDm) steps.push({ provider: "instagram", action: "send_dm", label: "Send Instagram DM" });
    if (wantsWhatsapp) steps.push({ provider: "whatsapp", action: "send_message", label: "Send WhatsApp message" });
    if (steps.length === 0) steps.push({ provider: "meta", action: "inspect", label: "Inspect request" });
    return {
      intent: wantsIgComments && wantsWhatsapp ? "comment_to_whatsapp" : "general_automation",
      summary: "Draft plan derived from your description. Review capabilities and permissions before activating.",
      steps,
      requiredCapabilities: [
        ...(wantsIgComments ? [{ product: "instagram", capability: "comments" }] : []),
        ...(wantsDm || wantsIgComments ? [{ product: "instagram", capability: "messaging" }] : []),
        ...(wantsWhatsapp ? [{ product: "whatsapp", capability: "messaging" }] : []),
      ],
      requiredPermissions: [],
      requiredAssets: [],
      missingRequirements: [],
      confidence: 0.72,
      needsConfirmation: true,
    };
  }

  async diagnoseError(input: { headline: string; detail: string }): Promise<string> {
    return `Probable cause: ${input.headline}. Evidence: ${input.detail}. Recommended fix: check connection health and reconnect if the token or permission is missing.`;
  }
}

/** Validation + permission + policy gate. The LLM NEVER bypasses this. */
export function validatePlan(
  raw: unknown,
  registry: CapabilityRegistry = new CapabilityRegistry(DEFAULT_CAPABILITIES),
): ExecutionPlan {
  const plan = executionPlanSchema.parse(raw);
  const requiredPermissions = new Set<string>();
  const requiredAssets = new Set<string>();
  const missing: string[] = [...plan.missingRequirements];

  for (const rc of plan.requiredCapabilities) {
    const cap = registry.get(rc.product as "instagram" | "whatsapp" | "facebook", rc.capability);
    if (!cap) {
      missing.push(`Unsupported capability: ${rc.product}:${rc.capability}. MetaFlux cannot configure it.`);
      continue;
    }
    for (const perm of cap.requiredPermissions) requiredPermissions.add(perm);
    for (const asset of cap.requiredAssets) requiredAssets.add(asset);
    if (cap.reviewRequired) missing.push(`${rc.product}:${rc.capability} may require Meta App Review approval.`);
  }

  return {
    ...plan,
    requiredPermissions: [...new Set([...plan.requiredPermissions, ...requiredPermissions])],
    requiredAssets: [...new Set([...plan.requiredAssets, ...requiredAssets])],
    missingRequirements: [...new Set(missing)],
  };
}
