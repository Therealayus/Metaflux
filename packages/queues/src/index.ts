export type JobName =
  | "webhook.process"
  | "workflow.execute"
  | "meta.api.request"
  | "message.send"
  | "token.refresh"
  | "health.check"
  | "analytics.aggregate"
  | "event.retry"
  | "notification.send";

export interface Job<T = unknown> {
  id: string;
  name: JobName;
  payload: T;
  idempotencyKey: string;
  attempts: number;
  maxAttempts: number;
  runAt: string;
}

/** Backoff with jitter: 5s, 25s, ~2min ... capped at 15min. */
export function backoffMs(attempt: number): number {
  const base = 5_000 * Math.pow(5, Math.min(attempt, 3));
  const jitter = Math.random() * 1_000;
  return Math.min(base + jitter, 900_000);
}

export function newJob<T>(name: JobName, payload: T, idempotencyKey: string): Job<T> {
  return {
    id: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    payload,
    idempotencyKey,
    attempts: 0,
    maxAttempts: 5,
    runAt: new Date().toISOString(),
  };
}
