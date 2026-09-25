import type { MetaApiClient } from "./client.js";
import type { MetaAssetType } from "./assets.js";
import type { MetaProduct } from "@socialflux/types";

export interface DiscoveredAsset {
  metaId: string;
  type: MetaAssetType;
  product: MetaProduct | "business";
  name: string;
  /** Meta ID of the parent asset (page for IG accounts, WABA for phone numbers). */
  parentMetaId?: string;
  /** Page-scoped access token (pages only) for subscribing webhooks / sending. Never logged. */
  pageAccessToken?: string;
}

interface GraphPage {
  id: string;
  name: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string };
}

/** Discover Facebook Pages + linked Instagram Business accounts. Real `me/accounts` call. */
export async function discoverFacebookPages(client: MetaApiClient, accessToken: string): Promise<DiscoveredAsset[]> {
  const res = await client.request<{ data?: GraphPage[] }>({
    method: "GET",
    path: "/me/accounts",
    accessToken,
    params: { fields: "id,name,access_token,instagram_business_account{id,username}", limit: 100 },
  });
  const out: DiscoveredAsset[] = [];
  for (const page of res.data.data ?? []) {
    out.push({
      metaId: page.id,
      type: "facebook_page",
      product: "facebook",
      name: page.name,
      pageAccessToken: page.access_token,
    });
    const ig = page.instagram_business_account;
    if (ig?.id) {
      out.push({
        metaId: ig.id,
        type: "instagram_business_account",
        product: "instagram",
        name: ig.username ? `@${ig.username}` : `IG ${ig.id}`,
        parentMetaId: page.id,
      });
    }
  }
  return out;
}

interface GraphBusiness {
  id: string;
  name: string;
  owned_whatsapp_business_accounts?: {
    data?: Array<{
      id: string;
      name?: string;
      phone_numbers?: { data?: Array<{ id: string; display_phone_number?: string; verified_name?: string }> };
    }>;
  };
}

/** Discover businesses → WhatsApp Business Accounts → phone numbers. Real `me/businesses` call. */
export async function discoverWhatsAppAssets(client: MetaApiClient, accessToken: string): Promise<DiscoveredAsset[]> {
  const res = await client.request<{ data?: GraphBusiness[] }>({
    method: "GET",
    path: "/me/businesses",
    accessToken,
    params: {
      fields: "id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}",
      limit: 25,
    },
  });
  const out: DiscoveredAsset[] = [];
  for (const biz of res.data.data ?? []) {
    out.push({ metaId: biz.id, type: "business", product: "business", name: biz.name });
    for (const waba of biz.owned_whatsapp_business_accounts?.data ?? []) {
      out.push({
        metaId: waba.id,
        type: "whatsapp_business_account",
        product: "whatsapp",
        name: waba.name ?? `WABA ${waba.id}`,
        parentMetaId: biz.id,
      });
      for (const phone of waba.phone_numbers?.data ?? []) {
        out.push({
          metaId: phone.id,
          type: "phone_number",
          product: "whatsapp",
          name: phone.display_phone_number ?? phone.verified_name ?? `Phone ${phone.id}`,
          parentMetaId: waba.id,
        });
      }
    }
  }
  return out;
}

/**
 * Subscribe a Page to the app for webhook delivery. Real `subscribed_apps` call.
 * Uses the page-scoped token returned by discovery.
 */
export async function subscribePageWebhooks(
  client: MetaApiClient,
  input: { pageId: string; pageAccessToken: string; fields: string[] },
): Promise<{ success: boolean }> {
  const res = await client.request<{ success?: boolean }>({
    method: "POST",
    path: `/${input.pageId}/subscribed_apps`,
    accessToken: input.pageAccessToken,
    body: { subscribed_fields: input.fields },
  });
  return { success: res.data.success === true };
}
