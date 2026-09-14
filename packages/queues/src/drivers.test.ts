import { describe, expect, it } from "vitest";
import { MemoryQueueDriver } from "./driver-memory.js";
import { RedisQueueDriver } from "./driver-redis.js";
import type { QueueDriver } from "./driver.js";
import { backoffMs, newJob } from "./index.js";

async function exerciseDriver(driver: QueueDriver): Promise<void> {
  const job = newJob("webhook.process", { eventId: "evt_1" }, "evt_1");
  await driver.enqueue(job);
  const got = await driver.dequeue("g1", "c1", 200);
  expect(got).toHaveLength(1);
  expect(got[0]?.job.idempotencyKey).toBe("evt_1");
  await driver.ack(got[0]?.handle as string);
  expect(await driver.queueDepth()).toBe(0);

  // Delayed jobs are invisible until due.
  const delayed = newJob("event.retry", { x: 1 }, "delayed_1");
  await driver.enqueue(delayed, 150);
  expect(await driver.dequeue("g1", "c1", 50)).toHaveLength(0);
  await new Promise((r) => setTimeout(r, 200));
  const due = await driver.dequeue("g1", "c1", 500);
  expect(due).toHaveLength(1);

  // Retry bumps attempts; dead-letter preserves the error.
  await driver.retry(due[0] as never, 0);
  const again = await driver.dequeue("g1", "c1", 500);
  expect(again[0]?.job.attempts).toBe(1);
  await driver.deadLetter(again[0] as never, "boom");
  expect(await driver.dlqDepth()).toBe(1);
  const peek = await driver.peekDlq();
  expect(peek[0]?.error).toBe("boom");
  await driver.close();
}

describe("memory queue driver", () => {
  it("enqueues, delays, retries and dead-letters", async () => {
    await exerciseDriver(new MemoryQueueDriver());
  });

  it("computes backoff with jitter and cap", () => {
    expect(backoffMs(0)).toBeGreaterThanOrEqual(5000);
    expect(backoffMs(99)).toBeLessThanOrEqual(900_000);
  });
});

describe.runIf(process.env.REDIS_URL)("redis queue driver", () => {
  it("enqueues, delays, retries and dead-letters over Redis Streams", async () => {
    const driver = new RedisQueueDriver(process.env.REDIS_URL, `test-${Date.now()}`);
    await exerciseDriver(driver);
  }, 30_000);
});
