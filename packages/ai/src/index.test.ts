import { describe, expect, it } from "vitest";
import { RuleBasedPlanner, validatePlan } from "./index.js";

describe("ai planner", () => {
  it("builds a comment-to-whatsapp plan and enriches permissions from the registry", async () => {
    const planner = new RuleBasedPlanner();
    const raw = await planner.generatePlan("When someone comments PRICE on Instagram, send WhatsApp message");
    const plan = validatePlan(raw);
    expect(plan.intent).toBe("comment_to_whatsapp");
    expect(plan.requiredPermissions).toContain("instagram_manage_comments");
    expect(plan.requiredPermissions).toContain("whatsapp_business_messaging");
    expect(plan.missingRequirements.some((m) => m.includes("App Review"))).toBe(true);
  });

  it("flags unsupported capabilities honestly instead of faking them", () => {
    const plan = validatePlan({
      intent: "x",
      summary: "y",
      steps: [{ provider: "meta", action: "do" }],
      requiredCapabilities: [{ product: "instagram", capability: "teleport" }],
      requiredPermissions: [],
      requiredAssets: [],
      missingRequirements: [],
      confidence: 0.5,
      needsConfirmation: true,
    });
    expect(plan.missingRequirements.some((m) => m.includes("Unsupported capability"))).toBe(true);
  });

  it("rejects malformed LLM output", () => {
    expect(() => validatePlan({ nope: true })).toThrow();
  });
});
