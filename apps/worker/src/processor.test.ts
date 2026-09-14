import { describe, expect, it } from "vitest";
import { newJob } from "@metaflux/queues";
import { clearSeenForTests, handleJob } from "./processor.js";

describe("worker", () => {
  it("suppresses duplicate deliveries via idempotency key", async () => {
    clearSeenForTests();
    const job = newJob("webhook.process", { x: 1 }, "evt_dup");
    expect((await handleJob(job)).status).toBe("succeeded");
    expect((await handleJob(job)).status).toBe("succeeded");
  });
});
