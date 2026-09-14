import type { MetaProduct } from "@metaflux/types";

export type { MetaProduct };

export interface MetaApiVersionEntry {
  version: string;
  deprecated: boolean;
  sunsetAt?: string;
}

/** Single source of truth for Meta API versions. Never scatter versions in code. */
export class MetaApiVersionRegistry {
  private versions: MetaApiVersionEntry[];
  private current: string;

  constructor(versions: MetaApiVersionEntry[], current: string) {
    this.versions = versions;
    this.current = current;
  }

  static fromEnv(envVersion = "v21.0"): MetaApiVersionRegistry {
    return new MetaApiVersionRegistry(
      [{ version: envVersion, deprecated: false }],
      envVersion,
    );
  }

  getCurrent(): string {
    return this.current;
  }

  graphUrl(path: string, version = this.current): string {
    const clean = path.startsWith("/") ? path : `/${path}`;
    return `https://graph.facebook.com/${version}${clean}`;
  }

  assertSupported(version: string): void {
    const entry = this.versions.find((v) => v.version === version);
    if (!entry) throw new Error(`Unsupported Meta API version: ${version}`);
    if (entry.deprecated) throw new Error(`Deprecated Meta API version: ${version}`);
  }
}

export interface Capability {
  provider: "meta";
  product: MetaProduct;
  capability: string;
  requiredPermissions: string[];
  requiredAssets: string[];
  apiVersions: string[];
  reviewRequired: boolean;
  businessVerificationMayBeRequired: boolean;
  description: string;
}

/** Versioned capability registry — no hard-coded Meta assumptions elsewhere. */
export class CapabilityRegistry {
  private caps = new Map<string, Capability>();

  constructor(seed: Capability[] = []) {
    for (const c of seed) this.register(c);
  }

  key(product: MetaProduct, capability: string): string {
    return `${product}:${capability}`;
  }

  register(cap: Capability): void {
    this.caps.set(this.key(cap.product, cap.capability), cap);
  }

  get(product: MetaProduct, capability: string): Capability | undefined {
    return this.caps.get(this.key(product, capability));
  }

  list(): Capability[] {
    return [...this.caps.values()];
  }
}

export const DEFAULT_CAPABILITIES: Capability[] = [
  {
    provider: "meta",
    product: "instagram",
    capability: "comments",
    requiredPermissions: ["instagram_basic", "instagram_manage_comments"],
    requiredAssets: ["instagram_business_account"],
    apiVersions: ["v21.0"],
    reviewRequired: true,
    businessVerificationMayBeRequired: false,
    description: "Read and listen to Instagram media comments.",
  },
  {
    provider: "meta",
    product: "instagram",
    capability: "messaging",
    requiredPermissions: ["instagram_basic", "instagram_manage_messages"],
    requiredAssets: ["instagram_business_account", "facebook_page"],
    apiVersions: ["v21.0"],
    reviewRequired: true,
    businessVerificationMayBeRequired: true,
    description: "Send and receive Instagram direct messages.",
  },
  {
    provider: "meta",
    product: "instagram",
    capability: "insights",
    requiredPermissions: ["instagram_basic", "read_insights"],
    requiredAssets: ["instagram_business_account"],
    apiVersions: ["v21.0"],
    reviewRequired: true,
    businessVerificationMayBeRequired: false,
    description: "Read Instagram media and account insights.",
  },
  {
    provider: "meta",
    product: "whatsapp",
    capability: "messaging",
    requiredPermissions: ["whatsapp_business_messaging"],
    requiredAssets: ["whatsapp_business_account", "phone_number"],
    apiVersions: ["v21.0"],
    reviewRequired: true,
    businessVerificationMayBeRequired: true,
    description: "Send WhatsApp messages and templates via Cloud API.",
  },
  {
    provider: "meta",
    product: "facebook",
    capability: "comments",
    requiredPermissions: ["pages_read_engagement", "pages_manage_posts"],
    requiredAssets: ["facebook_page"],
    apiVersions: ["v21.0"],
    reviewRequired: true,
    businessVerificationMayBeRequired: false,
    description: "Read and manage Facebook Page comments.",
  },
  {
    provider: "meta",
    product: "facebook",
    capability: "messaging",
    requiredPermissions: ["pages_messaging"],
    requiredAssets: ["facebook_page"],
    apiVersions: ["v21.0"],
    reviewRequired: true,
    businessVerificationMayBeRequired: true,
    description: "Send and receive Facebook Page messages.",
  },
];
