import { describe, expect, it } from "vitest";

describe("ui", () => {
  it("design system entry exists", async () => {
    const mod = await import("./index.js");
    expect(typeof mod.Button).toBe("function");
    expect(typeof mod.PermissionCard).toBe("function");
  });
});
