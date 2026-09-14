import type { Job } from "./index.js";

export interface QueuedJob<T = unknown> {
  /** Driver-native id (Redis stream entry id). Opaque to handlers. */
  handle: string;
  job: Job<T>;
}

/**
 * Durable queue driver contract. Implementations: in-memory (tests/dev) and
 * Redis Streams (production). Handlers stay driver-agnostic.
 */
export interface QueueDriver {
  readonly name: string;
  enqueue<T>(job: Job<T>, delayMs?: number): Promise<void>;
  /** Long-poll for due jobs. Returns promptly (possibly empty) after timeoutMs. */
  dequeue(group: string, consumer: string, timeoutMs?: number): Promise<Array<QueuedJob<unknown>>>;
  ack(handle: string): Promise<void>;
  /** Re-queue with attempts+1 after delayMs. */
  retry<T>(queued: QueuedJob<T>, delayMs: number): Promise<void>;
  deadLetter<T>(queued: QueuedJob<T>, error: string): Promise<void>;
  queueDepth(): Promise<number>;
  dlqDepth(): Promise<number>;
  peekDlq(limit?: number): Promise<Array<{ job: Job; error: string; failedAt: string }>>;
  close(): Promise<void>;
}
