import type { MetaProduct } from "@socialflux/types";

export type MetaAssetType =
  | "business"
  | "facebook_page"
  | "instagram_business_account"
  | "whatsapp_business_account"
  | "phone_number"
  | "ad_account";

export interface MetaAsset {
  id: string;
  type: MetaAssetType;
  product: MetaProduct | "business";
  name: string;
  metaId: string;
  parentId?: string;
  connectionId: string;
  healthy: boolean;
}

export interface AssetGraphNode extends MetaAsset {
  children: AssetGraphNode[];
  missingChildren: string[];
}

/** Builds Business -> Page -> IG / WABA -> phone hierarchy from a flat asset list. */
export function buildAssetGraph(assets: MetaAsset[]): AssetGraphNode[] {
  const byId = new Map<string, AssetGraphNode>();
  for (const a of assets) byId.set(a.id, { ...a, children: [], missingChildren: [] });

  const roots: AssetGraphNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Surface expected-but-missing children so the UI can say so honestly.
  for (const node of byId.values()) {
    if (node.type === "facebook_page") {
      const hasIg = node.children.some((c) => c.type === "instagram_business_account");
      if (!hasIg) node.missingChildren.push("instagram_business_account");
    }
    if (node.type === "whatsapp_business_account") {
      const hasPhone = node.children.some((c) => c.type === "phone_number");
      if (!hasPhone) node.missingChildren.push("phone_number");
    }
  }

  return roots;
}
