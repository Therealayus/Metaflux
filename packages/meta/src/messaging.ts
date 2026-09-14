import type { MetaApiClient } from "./client.js";
import type { MessageResult, MessagingProvider, SendMessageInput } from "./providers.js";

export interface MetaSendContext {
  /** Decrypted user/page token for most sends; page token for page sends. */
  accessToken: string;
  /** WhatsApp phone_number_id (from phone asset discovery / config). */
  whatsappPhoneNumberId?: string;
  /** Page or IG-scoped sender id for IG/FB sends. */
  senderId?: string;
}

/**
 * Meta implementation of MessagingProvider, bound to credentials at creation.
 * Real send endpoints:
 * - WhatsApp: POST /{phone-number-id}/messages (Cloud API)
 * - Instagram/Facebook: POST /{sender-id}/messages (Page/IG messaging)
 * Idempotency is enforced by the caller (execution idempotency keys); Meta
 * itself has no idempotency header, so retries reuse the same execution row.
 */
export function createMetaMessagingProvider(client: MetaApiClient, ctx: MetaSendContext): MessagingProvider {
  async function sendMessage(input: SendMessageInput): Promise<MessageResult> {
    if (input.channel === "whatsapp") {
      if (!ctx.whatsappPhoneNumberId) throw new Error("WhatsApp sends require a phone_number_id");
      const res = await client.request<{ messages?: Array<{ id: string }> }>({
        method: "POST",
        path: `/${ctx.whatsappPhoneNumberId}/messages`,
        accessToken: ctx.accessToken,
        body: { messaging_product: "whatsapp", to: input.recipient, type: "text", text: { body: input.text } },
      });
      const id = res.data.messages?.[0]?.id;
      if (!id) throw new Error("WhatsApp send returned no message id");
      return { providerMessageId: id, channel: "whatsapp", status: "sent" };
    }

    if (!ctx.senderId) throw new Error(`${input.channel} sends require a sender id`);
    const res = await client.request<{ message_id?: string; recipient_id?: string }>({
      method: "POST",
      path: `/${ctx.senderId}/messages`,
      accessToken: ctx.accessToken,
      body: { recipient: { id: input.recipient }, message: { text: input.text } },
    });
    const id = res.data.message_id ?? res.data.recipient_id;
    if (!id) throw new Error(`${input.channel} send returned no message id`);
    return { providerMessageId: id, channel: input.channel, status: "sent" };
  }

  return { sendMessage };
}
