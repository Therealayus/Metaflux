import { describe, expect, it } from "vitest";
import { validateWorkflowDefinition } from "./index.js";

describe("workflows", () => {
  it("accepts a valid trigger->action graph", () => {
    const def = validateWorkflowDefinition({
      nodes: [
        { id: "t", type: "trigger", label: "IG comment", config: {} },
        { id: "a", type: "send_message", label: "Send DM", config: {} },
      ],
      edges: [{ id: "e1", source: "t", target: "a" }],
    });
    expect(def.nodes).toHaveLength(2);
  });

  it("rejects graphs without exactly one trigger", () => {
    expect(() =>
      validateWorkflowDefinition({
        nodes: [{ id: "a", type: "send_message", label: "x", config: {} }],
        edges: [],
      }),
    ).toThrow();
  });
});
