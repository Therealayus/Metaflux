import { getStore } from "@metaflux/database";
import { normalizeWebhookEvent, verifyWebhookSignature } from "@metaflux/meta";
import { metrics } from "@metaflux/observability";
import { getQueueDriver, newJob } from "@metaflux/queues";
import type { FastifyInstance } from "fastify";
import { persistPayload, payloadStoreFromEnv } from "../payloads.js";
import { requestId } from "../tenant.js";

/**
 * Webhook gateway: verify -> normalize -> resolve tenant -> persist (dedup) -> enqueue.
 * Responds 202 fast; all long work happens in the worker. Meta requires 2xx,
 * so unmapped senders are acknowledged (and logged) rather than failed.
 */
export async function webhookRoutes(app: FastifyInstance) {
  const store = await getStore();
  const payloads = payloadStoreFromEnv();

  app.get("/api/v1/webhooks/meta", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "change-me-webhook-verify-token";
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === verifyToken) {
      return reply.status(200).send(q["hub.challenge"] ?? "");
    }
    return reply.status(403).send("Forbidden");
  });

  app.post("/api/v1/webhooks/meta", async (request, reply) => {
    const reqId = requestId(request);
    const secret = process.env.META_APP_SECRET ?? "";
    const sig = request.headers["x-hub-signature-256"];
    if (secret) {
      const raw = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
      if (!verifyWebhookSignature(raw, typeof sig === "string" ? sig : undefined, secret)) {
        request.log.warn({ requestId: reqId, msg: "invalid webhook signature" });
        return reply.status(401).send({ code: "invalid_signature", message: "Invalid webhook signature", requestId: reqId });
      }
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const product = typeof body.object === "string" ? body.object : "meta";
    const normalized = normalizeWebhookEvent(product, body);

    // Store outage → 5xx so Meta redelivers (at-least-once). Unmapped senders →
    // 2xx because retrying won't help and Meta would eventually disable delivery.
    let routed;
    try {
      routed = normalized.objectId ? await store.findConnectionByAssetMetaId(normalized.objectId) : null;
    } catch (err) {
      request.log.error({ requestId: reqId, err, msg: "event routing store unavailable" });
      return reply.status(503).send({ code: "store_unavailable", message: "Temporary failure — Meta will retry delivery", requestId: reqId });
    }
    if (!routed) {
      request.log.warn({ requestId: reqId, eventId: normalized.eventId, objectId: normalized.objectId, msg: "unmapped webhook sender" });
      metrics.webhookEvents.inc({ product, outcome: "unmapped" });
      return reply.status(202).send({ data: { accepted: true, mapped: false, eventId: normalized.eventId }, requestId: reqId });
    }

    const stored = await persistPayload(payloads, routed.organizationId, normalized.eventId, body);
    const { record, created } = await store.createEvent({
      organizationId: routed.organizationId,
      workspaceId: routed.workspaceId,
      provider: "meta",
      product: normalized.product,
      eventType: normalized.eventType,
      eventId: normalized.eventId,
      payloadRef: stored.ref ?? null,
      payload: stored.inline,
    });
    if (!created) {
      metrics.webhookEvents.inc({ product, outcome: "duplicate" });
      return reply.status(202).send({ data: { accepted: true, duplicate: true, eventId: normalized.eventId }, requestId: reqId });
    }

    const job = newJob(
      "webhook.process",
      { eventDbId: record.id, eventId: normalized.eventId, organizationId: routed.organizationId, workspaceId: routed.workspaceId },
      normalized.eventId,
    );
    await getQueueDriver().enqueue(job);
    await store.updateConnection(routed.connection.id, routed.organizationId, { lastEventAt: normalized.receivedAt });
    metrics.webhookEvents.inc({ product, outcome: "accepted" });
    request.log.info({ requestId: reqId, eventId: normalized.eventId, jobId: job.id });
    return reply.status(202).send({ data: { accepted: true, eventId: normalized.eventId, jobId: job.id }, requestId: reqId });
  });
}
