// Provider abstraction — the app depends on these interfaces, Meta adapters implement them.

export interface SendMessageInput {
  channel: "instagram" | "whatsapp" | "facebook";
  recipient: string;
  text: string;
  idempotencyKey: string;
}

export interface MessageResult {
  providerMessageId: string;
  channel: string;
  status: "sent" | "queued";
}

export interface MessagingProvider {
  sendMessage(input: SendMessageInput): Promise<MessageResult>;
}

export interface CommentProvider {
  listComments(input: { assetId: string; mediaId: string; accessToken: string }): Promise<unknown[]>;
}

export interface WebhookProvider {
  subscribe(input: { assetId: string; fields: string[]; accessToken: string }): Promise<{ subscriptionId: string }>;
}
