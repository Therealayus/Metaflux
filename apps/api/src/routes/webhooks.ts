import { normalizeWebhookEvent, verifyWebhookSignature } from "@metaflux/meta";
import { newJob } from "@metaflux/queues";
import type { FastifyInstance } from "fastify";
import { requestId } from "../tenant.js";

/**
 * Webhook gateway: verify -> normalize -> enqueue. Never does long work inline.
 * Queue persistence lands in Phase 3; foundation returns the durable job envelope
 * so the contract is fixed now.
 */
export async function webhookRoutes(app: FastifyInstance) {
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
    const job = newJob("webhook.process", normalized, normalized.eventId);
    request.log.info({ requestId: reqId, eventId: normalized.eventId, jobId: job.id });
    return reply.status(202).send({ data: { accepted: true, eventId: normalized.eventId, jobId: job.id }, requestId: reqId });
  });
}
