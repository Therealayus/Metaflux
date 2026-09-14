import { describe, expect, it } from "vitest";
import { loadConfig } from "./index.js";

describe("config", () => {
  it("loads defaults and rejects a short AUTH_SECRET", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgres://localhost/db",
        REDIS_URL: "redis://localhost",
        AUTH_SECRET: "short",
      }),
    ).toThrow();
    const cfg = loadConfig({
      DATABASE_URL: "postgres://localhost/db",
      REDIS_URL: "redis://localhost",
      AUTH_SECRET: "a".repeat(32),
    });
    expect(cfg.META_GRAPH_API_VERSION).toBe("v21.0");
  });
});
