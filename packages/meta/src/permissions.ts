import type { MetaProduct } from "@metaflux/types";

export interface PermissionDefinition {
  name: string;
  product: MetaProduct;
  why: string;
  reviewRequired: boolean;
  asset: string;
}

export type PermissionStatus = "granted" | "missing" | "expired" | "needs_review";

/** Permission registry: explains WHY each permission is needed in human language. */
export class PermissionRegistry {
  private perms = new Map<string, PermissionDefinition>();

  constructor(seed: PermissionDefinition[] = []) {
    for (const p of seed) this.perms.set(p.name, p);
  }

  register(p: PermissionDefinition): void {
    this.perms.set(p.name, p);
  }

  get(name: string): PermissionDefinition | undefined {
    return this.perms.get(name);
  }

  explain(name: string): string {
    const p = this.perms.get(name);
    if (!p) return `The permission "${name}" is required by Meta for this capability.`;
    return p.why;
  }

  list(): PermissionDefinition[] {
    return [...this.perms.values()];
  }
}

export const DEFAULT_PERMISSIONS: PermissionDefinition[] = [
  {
    name: "instagram_basic",
    product: "instagram",
    why: "Lets MetaFlux identify your Instagram Business Account and read basic profile and media data. Without it, automations cannot tell which account an event belongs to.",
    reviewRequired: true,
    asset: "instagram_business_account",
  },
  {
    name: "instagram_manage_comments",
    product: "instagram",
    why: "Lets MetaFlux receive Instagram comment events. Without it, automations cannot trigger when a customer comments.",
    reviewRequired: true,
    asset: "instagram_business_account",
  },
  {
    name: "instagram_manage_messages",
    product: "instagram",
    why: "Lets MetaFlux receive and send Instagram message events. Without it, DM automations cannot trigger or reply.",
    reviewRequired: true,
    asset: "instagram_business_account",
  },
  {
    name: "read_insights",
    product: "instagram",
    why: "Lets MetaFlux read reach and engagement metrics so health and analytics views can show performance.",
    reviewRequired: true,
    asset: "instagram_business_account",
  },
  {
    name: "whatsapp_business_messaging",
    product: "whatsapp",
    why: "Lets MetaFlux send WhatsApp messages through your WhatsApp Business Account. Without it, WhatsApp steps in workflows cannot execute.",
    reviewRequired: true,
    asset: "whatsapp_business_account",
  },
  {
    name: "pages_read_engagement",
    product: "facebook",
    why: "Lets MetaFlux read Page posts and comments so comment automations can trigger.",
    reviewRequired: true,
    asset: "facebook_page",
  },
  {
    name: "pages_manage_posts",
    product: "facebook",
    why: "Lets MetaFlux publish or manage Page content where your workflow requires it.",
    reviewRequired: true,
    asset: "facebook_page",
  },
  {
    name: "pages_messaging",
    product: "facebook",
    why: "Lets MetaFlux receive and send Facebook Page messages for Messenger automations.",
    reviewRequired: true,
    asset: "facebook_page",
  },
];

export interface PermissionEvaluation {
  permission: string;
  status: PermissionStatus;
  why: string;
  reviewRequired: boolean;
}

/** Pure function — easy to unit test. Compares required vs granted scopes. */
export function evaluatePermissions(
  required: string[],
  granted: string[],
  registry: PermissionRegistry,
): PermissionEvaluation[] {
  const grantedSet = new Set(granted);
  return required.map((name) => {
    const def = registry.get(name);
    return {
      permission: name,
      status: grantedSet.has(name) ? "granted" : "missing",
      why: registry.explain(name),
      reviewRequired: def?.reviewRequired ?? true,
    };
  });
}
