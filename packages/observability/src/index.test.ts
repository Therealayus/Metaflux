import { describe, expect, it } from "vitest";
import { newRequestId } from "./index.js";

describe("observability", () => {
  it("generates unique request ids", () => {
    expect(newRequestId()).not.toBe(newRequestId());
  });
});
