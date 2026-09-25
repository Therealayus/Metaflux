import { describe, expect, it } from "vitest";
import { newRequestId } from "./index.js";

describe("observability", () => {
  it("generates unique request ids", () => {
    expect(newRequestId()).not.toBe(newRequestId());
  });
});

describe("metrics", () => {
  it("renders prometheus text with cardinality-safe routes", async () => {
    const { metrics, renderMetrics, routeOf } = await import("./metrics.js");
    expect(routeOf("/api/v1/workflows/wf_123abc/executions")).toBe("/api/v1/workflows/:id/executions");
    metrics.httpRequests.inc({ route: "/x", method: "GET", status: "200" });
    metrics.httpLatency.observe(42, { route: "/x" });
    const text = renderMetrics();
    expect(text).toContain("socialflux_http_requests_total");
    expect(text).toContain("le=\"100\"");
  });
});
