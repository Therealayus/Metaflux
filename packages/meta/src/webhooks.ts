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

/** Best-effort sender extraction (commenter / message sender id) for reply addressing. */
export function extractSenderId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const root = payload as Record<string, unknown>;
  const candidates: unknown[] = [
    root.senderId,
    root.sender_id,
    (root.sender as Record<string, unknown> | undefined)?.id,
    (root.from as Record<string, unknown> | undefined)?.id,
  ];
  const entry = (root.entry as Array<Record<string, unknown>> | undefined)?.[0];
  const changes = (entry?.changes as Array<Record<string, unknown>> | undefined)?.[0];
  const value = changes?.value as Record<string, unknown> | undefined;
  candidates.push(
    value?.senderId,
    value?.sender_id,
    (value?.sender as Record<string, unknown> | undefined)?.id,
    (value?.from as Record<string, unknown> | undefined)?.id,
  );
  const messaging = (entry?.messaging as Array<Record<string, unknown>> | undefined)?.[0];
  candidates.push((messaging?.sender as Record<string, unknown> | undefined)?.id);
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return undefined;
}
