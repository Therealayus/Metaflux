import { getStore, type EventRecord, type Store } from "@metaflux/database";
import { childLogger } from "@metaflux/observability";
import {
  backoffMs,
  getQueueDriver,
  newJob,
  type Job,
  type JobName,
  type QueueDriver,
  type QueuedJob,
} from "@metaflux/queues";

export interface HandlerResult {
  status: "succeeded" | "retry" | "dead_letter";
  retryInMs?: number;
}

export type JobHandler = (job: Job, ctx: HandlerContext) => Promise<void>;

export interface HandlerContext {
  store: Store;
  log: ReturnType<typeof childLogger>;
}

const handlers = new Map<JobName, JobHandler>();

/** Phase 4 registers workflow.execute; unknown names dead-letter honestly. */
export function registerHandler(name: JobName, handler: JobHandler): void {
  handlers.set(name, handler);
}

export function clearHandlersForTests(): void {
  handlers.clear();
  registerCoreHandlers();
}

interface WebhookProcessPayload {
  eventDbId: string;
  eventId: string;
  organizationId: string;
  workspaceId?: string | null;
}

function registerCoreHandlers(): void {
  registerHandler("webhook.process", async (job, ctx) => {
    const p = job.payload as WebhookProcessPayload;
    const event = await ctx.store.getEvent(p.eventDbId, p.organizationId);
    if (!event) {
      ctx.log.warn({ jobId: job.id, msg: "event row gone; acknowledging stale job" });
      return;
    }
    await ctx.store.updateEvent(event.id, event.organizationId, {
      status: "processing",
      attemptCount: job.attempts + 1,
    });
    // Phase 4 matches workflows here. Today: durable ingest verified, marked processed.
    await ctx.store.updateEvent(event.id, event.organizationId, {
      status: "processed",
      processedAt: new Date().toISOString(),
      error: null,
    });
    ctx.log.info({ jobId: job.id, eventId: event.eventId, msg: "event processed" });
  });

  registerHandler("event.retry", async (job, ctx) => {
    const p = job.payload as { eventDbId: string; organizationId: string };
    const event = await ctx.store.getEvent(p.eventDbId, p.organizationId);
    if (!event) return;
    if (event.status === "processed") return;
    const retryJob = newJob(
      "webhook.process",
      { eventDbId: event.id, eventId: event.eventId, organizationId: event.organizationId, workspaceId: event.workspaceId },
      `manual-retry:${event.id}:${Date.now()}`,
    );
    await getQueueDriver().enqueue(retryJob);
    await ctx.store.updateEvent(event.id, event.organizationId, { status: "requeued" });
  });

  registerHandler("event.retention", async (_job, ctx) => {
    const days = Number(process.env.EVENT_RETENTION_DAYS ?? 90);
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const deleted = await ctx.store.deleteEventsBefore(cutoff);
    ctx.log.info({ deleted, cutoff, msg: "retention sweep complete" });
  });
}

async function handleOne(driver: QueueDriver, queued: QueuedJob, store: Store): Promise<void> {
  const job = queued.job;
  const log = childLogger({ operation: job.name });
  const handler = handlers.get(job.name);
  if (!handler) {
    log.error({ jobId: job.id, jobName: job.name, msg: "no handler registered" });
    await driver.deadLetter(queued, `No handler registered for ${job.name}`);
    return;
  }
  try {
    await handler(job, { store, log });
    await driver.ack(queued.handle);
  } catch (err) {
    const message = err instanceof Error ? err.message : "handler failed";
    const attempts = job.attempts + 1;
    if (attempts >= job.maxAttempts) {
      log.error({ jobId: job.id, err, msg: "dead letter" });
      await driver.deadLetter(queued, message);
      if (job.name === "webhook.process") {
        const p = job.payload as WebhookProcessPayload;
        await store
          .updateEvent(p.eventDbId, p.organizationId, { status: "dead_letter", error: message })
          .catch(() => undefined);
      }
    } else {
      log.warn({ jobId: job.id, attempt: attempts, msg: "retrying" });
      await driver.retry(queued, backoffMs(attempts));
      if (job.name === "webhook.process") {
        const p = job.payload as WebhookProcessPayload;
        await store
          .updateEvent(p.eventDbId, p.organizationId, { status: "retried", error: message })
          .catch(() => undefined);
      }
    }
  }
}

/** Process a single dequeue batch. Exported for tests. */
export async function processOnce(driver: QueueDriver, opts?: { group?: string; consumer?: string }): Promise<number> {
  const store = await getStore();
  const batch = await driver.dequeue(opts?.group ?? "metaflux", opts?.consumer ?? "worker-1", 250);
  const concurrency = Math.max(Number(process.env.QUEUE_CONCURRENCY ?? 5), 1);
  for (let i = 0; i < batch.length; i += concurrency) {
    await Promise.all(batch.slice(i, i + concurrency).map((q) => handleOne(driver, q, store)));
  }
  return batch.length;
}

export interface RunLoopOpts {
  group?: string;
  consumer?: string;
  driver?: QueueDriver;
}

/** Long-running worker loop with graceful shutdown. Never throws. */
export async function runLoop(opts: RunLoopOpts = {}): Promise<void> {
  const { getQueueDriver } = await import("@metaflux/queues");
  const driver = opts.driver ?? getQueueDriver();
  ensureLoopHandlers();
  const log = childLogger({ operation: "worker-loop" });
  log.info({ group: opts.group ?? "metaflux", msg: "worker loop started" });
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  while (!stopped) {
    try {
      await processOnce(driver, opts);
    } catch (err) {
      log.error({ err, msg: "loop iteration failed" });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  await driver.close();
  log.info({ msg: "worker loop stopped" });
}

/** Register the durable-ingest handlers. Automation (Phase 4) overrides webhook.process afterwards. */
export function registerCoreHandlersPublic(): void {
  registerCoreHandlers();
}

/** The loop ensures infra handlers without clobbering a webhook.process override. */
export function ensureLoopHandlers(): void {
  const override = handlers.get("webhook.process");
  registerCoreHandlers();
  if (override) handlers.set("webhook.process", override);
}

// Legacy single-job entry kept for backward-compatible tests.
const seen = new Set<string>();

export function isDuplicate(idempotencyKey: string): boolean {
  if (seen.has(idempotencyKey)) return true;
  seen.add(idempotencyKey);
  return false;
}

export function clearSeenForTests(): void {
  seen.clear();
}

export async function handleJob(job: Job): Promise<HandlerResult> {
  const log = childLogger({ operation: job.name });
  if (isDuplicate(job.idempotencyKey)) {
    log.info({ jobId: job.id, msg: "duplicate suppressed" });
    return { status: "succeeded" };
  }
  try {
    if (handlers.size === 0) registerCoreHandlers();
    const fn = handlers.get(job.name);
    if (!fn) {
      return { status: "dead_letter" };
    }
    const store = await getStore();
    await fn(job, { store, log });
    return { status: "succeeded" };
  } catch {
    const attempts = job.attempts + 1;
    if (attempts >= job.maxAttempts) {
      return { status: "dead_letter" };
    }
    return { status: "retry", retryInMs: backoffMs(attempts) };
  }
}

export type { EventRecord };
