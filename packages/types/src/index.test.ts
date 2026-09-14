import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "./index.js";

describe("types", () => {
  it("accepts a minimal workflow definition", () => {
    const def: WorkflowDefinition = {
      nodes: [{ id: "n1", type: "trigger", label: "Instagram comment", config: {} }],
      edges: [],
    };
    expect(def.nodes).toHaveLength(1);
  });
});
