import type { Job } from "./index.js";
import type { QueueDriver, QueuedJob } from "./driver.js";

interface Delayed<T = unknown> {
  job: Job<T>;
  runAt: number;
}

/** In-process driver for tests and local dev without Redis. Same contract, no durability. */
export class MemoryQueueDriver implements QueueDriver {
  readonly name = "memory";
  private ready: Array<QueuedJob> = [];
  private delayed: Array<Delayed> = [];
  private dlq: Array<{ job: Job; error: string; failedAt: string }> = [];
  private seq = 0;
  private closed = false;

  private promoteDue(): void {
    const now = Date.now();
    const stillDelayed: Array<Delayed> = [];
    for (const d of this.delayed) {
      if (d.runAt <= now) {
        this.ready.push({ handle: `mem-${this.seq++}`, job: { ...d.job } });
      } else {
        stillDelayed.push(d);
      }
    }
    this.delayed = stillDelayed;
  }

  async enqueue<T>(job: Job<T>, delayMs = 0): Promise<void> {
    if (this.closed) throw new Error("Queue is closed");
    if (delayMs > 0) {
      this.delayed.push({ job: { ...job }, runAt: Date.now() + delayMs });
    } else {
      this.ready.push({ handle: `mem-${this.seq++}`, job: { ...job } });
    }
  }

  async dequeue(_group: string, _consumer: string, timeoutMs = 100): Promise<Array<QueuedJob<unknown>>> {
    this.promoteDue();
    if (this.ready.length > 0) return [this.ready.shift() as QueuedJob<unknown>];
    // Simulate long-poll: wait briefly for a delayed job to become due.
    const wait = Math.min(Math.max(timeoutMs, 0), 250);
    if (wait > 0 && this.delayed.length > 0) {
      await new Promise((r) => setTimeout(r, wait));
      this.promoteDue();
      if (this.ready.length > 0) return [this.ready.shift() as QueuedJob<unknown>];
    }
    return [];
  }

  async ack(_handle: string): Promise<void> {
    // No-op: dequeue already removed the job.
  }

  async retry<T>(queued: QueuedJob<T>, delayMs: number): Promise<void> {
    await this.enqueue({ ...queued.job, attempts: queued.job.attempts + 1 }, delayMs);
  }

  async deadLetter<T>(queued: QueuedJob<T>, error: string): Promise<void> {
    this.dlq.push({ job: queued.job, error, failedAt: new Date().toISOString() });
  }

  async queueDepth(): Promise<number> {
    return this.ready.length + this.delayed.length;
  }

  async dlqDepth(): Promise<number> {
    return this.dlq.length;
  }

  async peekDlq(limit = 20): Promise<Array<{ job: Job; error: string; failedAt: string }>> {
    return this.dlq.slice(-limit);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
