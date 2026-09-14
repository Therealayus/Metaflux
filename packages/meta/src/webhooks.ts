import { createHmac, timingSafeEqual } from "node:crypto";

/** Meta webhook signature uses X-Hub-Signature-256: sha256=<hex>. */
export function verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface NormalizedWebhookEvent {
  eventId: string;
  product: string;
  eventType: string;
  receivedAt: string;
  objectId?: string;
}

/** Extract a stable event identity for idempotency/dedup. Never trust it blindly — DB unique constraint is the backstop. */
export function normalizeWebhookEvent(product: string, payload: Record<string, unknown>): NormalizedWebhookEvent {
  const entry = (payload.entry as Array<Record<string, unknown>> | undefined)?.[0];
  const changes = (entry?.changes as Array<Record<string, unknown>> | undefined)?.[0];
  const field = typeof changes?.field === "string" ? changes.field : "unknown";
  const id = typeof entry?.id === "string" ? entry.id : typeof payload.id === "string" ? payload.id : "unknown";
  const time = typeof entry?.time === "number" ? entry.time : Date.now() / 1000;
  return {
    eventId: `${product}:${id}:${field}:${Math.floor(time)}`,
    product,
    eventType: `${field}`,
    receivedAt: new Date().toISOString(),
    objectId: id,
  };
}
