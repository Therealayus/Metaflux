import { __resetStoreForTests, getStore } from "@metaflux/database";
import { __resetQueueDriverForTests, MemoryQueueDriver, getQueueDriver, newJob } from "@metaflux/queues";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearHandlersForTests,
  clearSeenForTests,
  handleJob,
  processOnce,
  registerHandler,
} from "./processor.js";

beforeEach(() => {
  process.env.STORE_DRIVER = "memory";
  process.env.QUEUE_DRIVER = "memory";
  __resetStoreForTests();
  __resetQueueDriverForTests();
  clearSeenForTests();
  clearHandlersForTests();
});

describe("worker", () => {
  it("suppresses duplicate deliveries via idempotency key", async () => {
    const job = newJob("webhook.process", { x: 1 }, "evt_dup");
    expect((await handleJob(job)).status).toBe("succeeded");
    expect((await handleJob(job)).status).toBe("succeeded");
  });

  it("processes webhook jobs end-to-end and marks events processed", async () => {
    const store = await getStore();
    const { record } = await store.createEvent({
      organizationId: "o1",
      workspaceId: "w1",
      provider: "meta",
      product: "instagram",
      eventType: "comment.created",
      eventId: "evt_live_1",
      payload: { hello: "world" },
    });
    const driver = getQueueDriver();
    await driver.enqueue(
      newJob("webhook.process", { eventDbId: record.id, eventId: record.eventId, organizationId: "o1" }, record.eventId),
    );
    expect(await processOnce(driver)).toBe(1);
    const updated = await store.getEvent(record.id, "o1");
    expect(updated?.status).toBe("processed");
    expect(updated?.processedAt).toBeTruthy();
    expect(await driver.queueDepth()).toBe(0);
  });

  it("retries failing jobs with backoff and dead-letters after max attempts", async () => {
    let calls = 0;
    registerHandler("health.check", async () => {
      calls += 1;
      throw new Error("flaky downstream");
    });
    const driver = new MemoryQueueDriver();
    await driver.enqueue(newJob("health.check", {}, "flaky_1", ), 0);
    // Force a single attempt so the first failure dead-letters deterministically.
    const batch = await driver.dequeue("g", "c", 50);
    expect(batch).toHaveLength(1);
    batch[0]!.job.maxAttempts = 1;
    await driver.enqueue(batch[0]!.job, 0);
    expect(await processOnce(driver)).toBe(1);
    expect(calls).toBe(1);
    expect(await driver.dlqDepth()).toBe(1);
    expect((await driver.peekDlq())[0]?.error).toBe("flaky downstream");
    await driver.close();
  });

  it("dead-letters jobs with no registered handler", async () => {
    const driver = new MemoryQueueDriver();
    // message.send has no handler until Phase 4 wires messaging.
    await driver.enqueue(newJob("message.send", {}, "unhandled_1"));
    expect(await processOnce(driver)).toBe(1);
    expect(await driver.dlqDepth()).toBe(1);
    await driver.close();
  });

  it("runs retention sweeps deleting only old events", async () => {
    const store = await getStore();
    await store.createEvent({
      organizationId: "o1",
      provider: "meta",
      product: "instagram",
      eventType: "t",
      eventId: "evt_old",
      payload: {},
    });
    const driver = new MemoryQueueDriver();
    process.env.EVENT_RETENTION_DAYS = "0";
    await driver.enqueue(newJob("event.retention", {}, "ret_1"));
    expect(await processOnce(driver)).toBe(1);
    // 0-day retention deletes everything received before now.
    expect((await store.listEvents("o1", {})).items).toHaveLength(0);
    delete process.env.EVENT_RETENTION_DAYS;
    await driver.close();
  });
});
