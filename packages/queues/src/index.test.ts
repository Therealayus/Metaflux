import { describe, expect, it } from "vitest";
import { backoffMs, newJob } from "./index.js";

describe("queues", () => {
  it("creates idempotent jobs with backoff", () => {
    const j = newJob("webhook.process", { a: 1 }, "evt_1");
    expect(j.idempotencyKey).toBe("evt_1");
    expect(backoffMs(0)).toBeGreaterThanOrEqual(5_000);
    expect(backoffMs(99)).toBeLessThanOrEqual(900_000);
  });
});
