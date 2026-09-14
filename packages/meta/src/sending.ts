import type { MetaApiClient } from "./client.js";
import { createMetaMessagingProvider, type MetaSendContext } from "./messaging.js";
import type { MessagingProvider } from "./providers.js";

export type SendChannel = "whatsapp" | "instagram" | "facebook";

export interface SenderConnection {
  id: string;
  product: string;
  encryptedToken: string | null;
}

export interface SenderAsset {
  connectionId: string;
  type: string;
  metaId: string;
  encryptedToken: string | null;
}

export interface ResolvedSender {
  provider: MessagingProvider;
  connectionId: string;
  product: string;
}

/**
 * Shared sender resolution for the API (POST /v1/messages) and the worker
 * (send_message nodes). Pure apart from the injected decryptor — the caller
 * owns token handling and tenant scoping.
 */
export function resolveSender(input: {
  channel: SendChannel;
  connections: SenderConnection[];
  assets: SenderAsset[];
  decrypt: (ciphertext: string) => string;
  client: MetaApiClient;
}): ResolvedSender {
  const product = input.channel;
  const conn = input.connections.find((c) => c.product === product && c.encryptedToken);
  if (!conn?.encryptedToken) {
    throw Object.assign(
      new Error(`No connected ${input.channel} account — connect it and run asset discovery first`),
      { status: 409, code: "no_sender" },
    );
  }
  const userToken = input.decrypt(conn.encryptedToken);
  const mine = input.assets.filter((a) => a.connectionId === conn.id);
  let ctx: MetaSendContext;

  if (input.channel === "whatsapp") {
    const phone = mine.find((a) => a.type === "phone_number");
    if (!phone) {
      throw Object.assign(new Error("No WhatsApp phone number discovered — run asset discovery first"), {
        status: 409,
        code: "no_sender",
      });
    }
    ctx = { accessToken: userToken, whatsappPhoneNumberId: phone.metaId };
  } else {
    const sender = mine.find((a) => a.type === "instagram_business_account" || a.type === "facebook_page");
    if (!sender) {
      throw Object.assign(new Error(`No ${input.channel} sender asset — run asset discovery first`), {
        status: 409,
        code: "no_sender",
      });
    }
    // Page sends require the page-scoped token stored on the asset.
    const token = sender.encryptedToken ? input.decrypt(sender.encryptedToken) : userToken;
    ctx = { accessToken: token, senderId: sender.metaId };
  }

  return { provider: createMetaMessagingProvider(input.client, ctx), connectionId: conn.id, product };
}

export function parseChannel(raw: unknown): SendChannel {
  if (raw === "whatsapp" || raw === "instagram" || raw === "facebook") return raw;
  throw Object.assign(new Error("channel must be whatsapp, instagram or facebook"), { status: 400 });
}
