import type { QueueDriver } from "./driver.js";
import { MemoryQueueDriver } from "./driver-memory.js";
import { RedisQueueDriver } from "./driver-redis.js";

export type { QueueDriver, QueuedJob } from "./driver.js";
export { MemoryQueueDriver } from "./driver-memory.js";
export { RedisQueueDriver } from "./driver-redis.js";

let cached: QueueDriver | null = null;

/**
 * Driver selection: explicit QUEUE_DRIVER, else Redis when REDIS_URL is set,
 * else in-memory. In-memory is never used in production (warn loudly).
 */
export function getQueueDriver(): QueueDriver {
  if (cached) return cached;
  const explicit = process.env.QUEUE_DRIVER;
  if (explicit === "memory") {
    cached = new MemoryQueueDriver();
  } else if (explicit === "redis" || process.env.REDIS_URL) {
    cached = new RedisQueueDriver();
  } else {
    console.warn("[queues] No QUEUE_DRIVER/REDIS_URL — using in-memory queue (dev only, not durable)");
    cached = new MemoryQueueDriver();
  }
  return cached;
}

/** Test-only reset. */
export function __resetQueueDriverForTests(): void {
  cached = null;
}
