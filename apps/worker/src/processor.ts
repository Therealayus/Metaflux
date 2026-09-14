import { childLogger } from "@metaflux/observability";
import { backoffMs, type Job, type JobName } from "@metaflux/queues";

export interface HandlerResult {
  status: "succeeded" | "retry" | "dead_letter";
  retryInMs?: number;
}

const seen = new Set<string>();

/** Idempotency guard: duplicate deliveries collapse to a single execution. */
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
    switch (job.name as JobName) {
      case "webhook.process":
      case "workflow.execute":
      case "health.check":
        log.info({ jobId: job.id, msg: "processed" });
        return { status: "succeeded" };
      default:
        log.info({ jobId: job.id, msg: "processed" });
        return { status: "succeeded" };
    }
  } catch (err) {
    const attempts = job.attempts + 1;
    if (attempts >= job.maxAttempts) {
      log.error({ jobId: job.id, err, msg: "dead letter" });
      return { status: "dead_letter" };
    }
    return { status: "retry", retryInMs: backoffMs(attempts) };
  }
}
