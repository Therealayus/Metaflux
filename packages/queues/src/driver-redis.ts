import { Redis } from "ioredis";
import type { Job } from "./index.js";
import type { QueueDriver, QueuedJob } from "./driver.js";

/**
 * Production driver over Redis Streams + sorted-set delays + list DLQ.
 * - Ready jobs: XADD/XREADGROUP on mf:queue with consumer groups (safe multi-worker).
 * - Delayed jobs: ZADD on mf:delayed scored by runAt; promoted by the worker loop.
 * - Failures: XACK + RPUSH mf:dlq after maxAttempts.
 */
export class RedisQueueDriver implements QueueDriver {
  readonly name = "redis";
  private redis: Redis;
  private stream: string;
  private delayedKey: string;
  private dlqKey: string;
  private readyKey: string;
  private groupsEnsured = new Set<string>();

  constructor(
    redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379",
    namespace = process.env.QUEUE_NAMESPACE ?? "mf",
    client?: Redis,
  ) {
    this.redis = client ?? new Redis(redisUrl, { maxRetriesPerRequest: 3, enableReadyCheck: true });
    this.stream = `${namespace}:queue`;
    this.delayedKey = `${namespace}:delayed`;
    this.dlqKey = `${namespace}:dlq`;
    this.readyKey = `${namespace}:ready`;
  }

  private async ensureGroup(group: string): Promise<void> {
    if (this.groupsEnsured.has(group)) return;
    try {
      await this.redis.xgroup("CREATE", this.stream, group, "0", "MKSTREAM");
    } catch (err) {
      if (!String((err as Error).message ?? err).includes("BUSYGROUP")) throw err;
    }
    this.groupsEnsured.add(group);
  }

  /** Move due delayed jobs onto the stream. Called on every dequeue. */
  private async promoteDue(): Promise<void> {
    const now = Date.now();
    const due = await this.redis.zrangebyscore(this.delayedKey, 0, now, "LIMIT", 0, 100);
    if (due.length === 0) return;
    const pipe = this.redis.pipeline();
    for (const payload of due) {
      pipe.xadd(this.stream, "*", "job", payload);
      pipe.zrem(this.delayedKey, payload);
      pipe.incr(this.readyKey);
    }
    await pipe.exec();
  }

  /** Recover entries whose worker crashed mid-processing (idle > 30s). No counter change. */
  private async reclaimStale(group: string, consumer: string): Promise<Array<QueuedJob<unknown>>> {
    const out: Array<QueuedJob<unknown>> = [];
    try {
      const res = (await this.redis.xautoclaim(this.stream, group, consumer, 30_000, "0-0", "COUNT", 10)) as
        | [string, Array<[string, string[]]>]
        | null;
      const entries = Array.isArray(res) ? res[1] ?? [] : [];
      for (const [id, fields] of entries) {
        const raw = fields[fields.indexOf("job") + 1] as string;
        try {
          out.push({ handle: RedisQueueDriver.tag(group, id), job: JSON.parse(raw) as Job<unknown> });
        } catch {
          await this.redis.xack(this.stream, group, id);
        }
      }
    } catch {
      // Best-effort: a failed reclaim must never block fresh deliveries.
    }
    return out;
  }

  async enqueue<T>(job: Job<T>, delayMs = 0): Promise<void> {
    const payload = JSON.stringify(job);
    if (delayMs > 0) {
      await this.redis.zadd(this.delayedKey, Date.now() + delayMs, payload);
    } else {
      const pipe = this.redis.pipeline();
      pipe.xadd(this.stream, "*", "job", payload);
      pipe.incr(this.readyKey);
      await pipe.exec();
    }
  }

  async dequeue(group: string, consumer: string, timeoutMs = 1000): Promise<Array<QueuedJob<unknown>>> {
    await this.ensureGroup(group);
    await this.promoteDue();
    const claimed = await this.reclaimStale(group, consumer);
    const res = (await this.redis.xreadgroup(
      "GROUP",
      group,
      consumer,
      "COUNT",
      10,
      "BLOCK",
      Math.max(timeoutMs, 0),
      "STREAMS",
      this.stream,
      ">",
    )) as Array<[string, Array<[string, string[]]>]> | null;
    const out: Array<QueuedJob<unknown>> = [...claimed];
    if (res) {
      let fresh = 0;
      for (const [, entries] of res) {
        for (const [id, fields] of entries) {
          const raw = fields[fields.indexOf("job") + 1] as string;
          try {
            out.push({ handle: RedisQueueDriver.tag(group, id), job: JSON.parse(raw) as Job<unknown> });
            fresh += 1;
          } catch {
            // Poison entry: acknowledge so it never blocks the stream.
            await this.redis.xack(this.stream, group, id);
          }
        }
      }
      if (fresh > 0) await this.redis.decrby(this.readyKey, fresh);
    }
    return out;
  }

  async ack(handle: string): Promise<void> {
    // Acknowledge across all groups that may own the pending entry is overkill;
    // the worker loop passes its group — stored on the handle prefix.
    const sep = handle.lastIndexOf("@");
    if (sep === -1) return;
    const group = handle.slice(0, sep);
    const id = handle.slice(sep + 1);
    await this.redis.xack(this.stream, group, id);
  }

  async retry<T>(queued: QueuedJob<T>, delayMs: number): Promise<void> {
    await this.ack(queued.handle);
    await this.enqueue({ ...queued.job, attempts: queued.job.attempts + 1 }, delayMs);
  }

  async deadLetter<T>(queued: QueuedJob<T>, error: string): Promise<void> {
    await this.ack(queued.handle);
    await this.redis.rpush(
      this.dlqKey,
      JSON.stringify({ job: queued.job, error, failedAt: new Date().toISOString() }),
    );
    await this.redis.ltrim(this.dlqKey, -1000, -1);
  }

  async queueDepth(): Promise<number> {
    const [ready, delayed] = await Promise.all([
      this.redis.get(this.readyKey).then((v: string | null) => Math.max(Number(v ?? 0), 0)),
      this.redis.zcard(this.delayedKey),
    ]);
    return ready + delayed;
  }

  async dlqDepth(): Promise<number> {
    return this.redis.llen(this.dlqKey);
  }

  async peekDlq(limit = 20): Promise<Array<{ job: Job; error: string; failedAt: string }>> {
    const raw = await this.redis.lrange(this.dlqKey, -limit, -1);
    return raw.map((r: string) => JSON.parse(r) as { job: Job; error: string; failedAt: string });
  }

  async close(): Promise<void> {
    this.redis.disconnect();
  }

  /** Tag a stream handle with its consumer group so ack() can route correctly. */
  static tag(group: string, id: string): string {
    return `${group}@${id}`;
  }
}
