import { requireRole } from "@metaflux/auth";
import { PLANS, createCheckoutSession, getPlan, verifyStripeWebhook } from "@metaflux/billing";
import { monthStartIso } from "@metaflux/ai";
import { getStore } from "@metaflux/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { planFor } from "@metaflux/billing";
import { requestId, requireTenant, sendError } from "../tenant.js";

const checkoutBody = z.object({ plan: z.enum(["starter", "growth", "business"]) });
const manualPlanBody = z.object({ plan: z.enum(["free", "starter", "growth", "business", "enterprise"]) });

function priceIdFor(plan: string): string | undefined {
  return process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
}

export async function billingRoutes(app: FastifyInstance) {
  const store = await getStore();

  app.get("/api/v1/billing/subscription", async (request, reply) => {
    const ctx = await requireTenant(request);
    const plan = await planFor(store, ctx.organizationId);
    const sub = await store.getSubscription(ctx.organizationId);
    const [workflows, executions, apiRequests, aiSpend] = await Promise.all([
      store.countWorkflows(ctx.organizationId),
      store.countExecutionsSince(ctx.organizationId, monthStartIso()),
      store.countApiRequests(ctx.organizationId, new Date(Date.now() - 30 * 86400_000).toISOString()),
      store.sumAiUsageCostSince(ctx.organizationId, monthStartIso()),
    ]);
    return reply.send({
      data: {
        plan: plan.id,
        planName: plan.name,
        status: sub?.status ?? "active",
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
        entitlements: plan.entitlements,
        usage: {
          workflows,
          executionsThisMonth: executions,
          apiRequests30d: apiRequests,
          aiSpendCentsMonth: Math.round(aiSpend * 100) / 100,
        },
        plans: Object.values(PLANS).map((p) => ({ id: p.id, name: p.name, monthlyCents: p.monthlyCents, entitlements: p.entitlements })),
      },
      requestId: requestId(request),
    });
  });

  app.post("/api/v1/billing/checkout", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireRole(await requireTenant(request), "admin");
    const parsed = checkoutBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "plan must be starter, growth or business", reqId);
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const priceId = priceIdFor(parsed.data.plan);
    if (!secretKey || !priceId) {
      return sendError(reply, 501, "billing_not_configured", "Stripe billing is not configured on this instance", reqId);
    }
    try {
      const session = await createCheckoutSession({
        secretKey,
        priceId,
        plan: parsed.data.plan,
        successUrl: `${process.env.WEB_URL ?? "http://localhost:3000"}/billing?checkout=success`,
        cancelUrl: `${process.env.WEB_URL ?? "http://localhost:3000"}/billing?checkout=cancelled`,
        organizationId: ctx.organizationId,
      });
      return reply.send({ data: session, requestId: reqId });
    } catch (err) {
      return sendError(reply, 502, "checkout_failed", err instanceof Error ? err.message : "Checkout failed", reqId);
    }
  });

  // Stripe webhook: verified against the RAW body (captured by the preParsing hook).
  app.post(
    "/api/v1/billing/webhook",
    { config: { rawBody: true } as object },
    async (request, reply) => {
      const reqId = requestId(request);
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) return sendError(reply, 501, "billing_not_configured", "Stripe webhooks are not configured", reqId);
      const raw = (request as unknown as { rawBodyText?: string }).rawBodyText;
      if (!raw) return sendError(reply, 400, "missing_body", "Raw body unavailable", reqId);
      let event;
      try {
        event = verifyStripeWebhook(raw, request.headers["stripe-signature"] as string | undefined, secret);
      } catch (err) {
        return sendError(reply, 401, "invalid_signature", err instanceof Error ? err.message : "Invalid signature", reqId);
      }
      try {
        const obj = event.data.object as Record<string, unknown>;
        if (event.type === "checkout.session.completed") {
          const metadata = (obj.metadata ?? {}) as Record<string, string>;
          const orgId = metadata.organizationId;
          if (orgId) {
            // Plan travels in metadata (set at checkout creation). Unknown values
            // fall back to free — never grant paid entitlements on ambiguous data.
            let planId = "free";
            try {
              planId = getPlan(metadata.plan ?? "").id;
            } catch {
              request.log.warn({ requestId: reqId, metadata, msg: "unknown plan in checkout metadata" });
            }
            await store.upsertSubscription(orgId, {
              plan: planId,
              status: "active",
              stripeCustomerId: obj.customer as string | undefined,
              stripeSubscriptionId: obj.subscription as string | undefined,
            });
            await store.audit(orgId, null, "billing.subscription.activated", planId);
          }
        } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
          const subId = obj.id as string | undefined;
          const customer = obj.customer as string | undefined;
          if (event.type === "customer.subscription.deleted") {
            const found = await store.findSubscriptionByStripeId({ subscriptionId: subId });
            if (found) {
              await store.upsertSubscription(found.organizationId, { plan: "free", status: "canceled" });
              await store.audit(found.organizationId, null, "billing.subscription.canceled", subId);
            }
          } else if (customer) {
            const found = await store.findSubscriptionByStripeId({ customerId: customer });
            if (found) {
              await store.upsertSubscription(found.organizationId, {
                status: (obj.status as string | undefined) ?? "active",
                currentPeriodEnd: obj.current_period_end
                  ? new Date(Number(obj.current_period_end) * 1000).toISOString()
                  : undefined,
              });
            }
          }
        }
        return reply.send({ data: { received: true }, requestId: reqId });
      } catch (err) {
        request.log.error({ requestId: reqId, err });
        return sendError(reply, 500, "webhook_failed", "Failed to process billing event", reqId);
      }
    },
  );

  // Manual plan override for self-hosted/dev instances without Stripe. Owner-only, audited.
  app.post("/api/v1/billing/plan", async (request, reply) => {
    const reqId = requestId(request);
    const ctx = requireRole(await requireTenant(request), "owner");
    const parsed = manualPlanBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Invalid plan", reqId);
    getPlan(parsed.data.plan); // validates
    const sub = await store.upsertSubscription(ctx.organizationId, { plan: parsed.data.plan, status: "active" });
    await store.audit(ctx.organizationId, ctx.userId, "billing.plan.changed", parsed.data.plan);
    return reply.send({ data: { plan: sub.plan, status: sub.status }, requestId: reqId });
  });
}
