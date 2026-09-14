import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal Stripe client over plain HTTPS (no SDK). Used for Checkout Session
 * creation and webhook verification. Keys stay server-side.
 */

export interface CheckoutSessionInput {
  secretKey: string;
  priceId: string;
  plan: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  organizationId: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export async function createCheckoutSession(
  input: CheckoutSessionInput,
  fetchFn: typeof fetch = fetch,
): Promise<CheckoutSession> {
  const body = new URLSearchParams({
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": "1",
    mode: "subscription",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "metadata[organizationId]": input.organizationId,
    "metadata[plan]": input.plan,
  });
  if (input.customerEmail) body.set("customer_email", input.customerEmail);
  const res = await fetchFn("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${input.secretKey}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !data.id || !data.url) throw new Error(data.error?.message ?? "Stripe checkout creation failed");
  return { id: data.id, url: data.url };
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * Verify `Stripe-Signature` (t=...,v1=...) over the RAW body with 5-min tolerance.
 * Returns the parsed event on success; throws otherwise.
 */
export function verifyStripeWebhook(rawBody: string | Buffer, signature: string | undefined, secret: string): StripeEvent {
  if (!signature) throw new Error("Missing Stripe signature");
  const parts = Object.fromEntries(signature.split(",").map((p) => p.split("=", 2) as [string, string]));
  const timestamp = Number(parts.t);
  const v1 = parts.v1;
  if (!timestamp || !v1) throw new Error("Malformed Stripe signature");
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) throw new Error("Stale Stripe webhook");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid Stripe signature");
  return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody) as StripeEvent;
}

/** Map a Stripe subscription object onto our plan model. */
export function planFromStripePrice(priceId: string | undefined, priceMap: Record<string, string>): string {
  if (!priceId) return "free";
  return priceMap[priceId] ?? "free";
}
