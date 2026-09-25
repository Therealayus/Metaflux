import { z } from "zod";
import type { WorkflowDefinition } from "@socialflux/types";

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "trigger",
    "condition",
    "filter",
    "delay",
    "ai",
    "send_message",
    "create_lead",
    "webhook",
    "http_request",
    "branch",
    "transform",
    "log",
  ]),
  label: z.string().min(1),
  config: z.record(z.unknown()).default({}),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional(),
});

export const workflowDefinitionSchema = z.object({
  nodes: z.array(nodeSchema).min(1),
  edges: z.array(edgeSchema),
});

/** Validates structure + referential integrity. Execution itself is async in the worker. */
export function validateWorkflowDefinition(def: WorkflowDefinition): WorkflowDefinition {
  const parsed = workflowDefinitionSchema.parse(def);
  const ids = new Set(parsed.nodes.map((n) => n.id));
  const triggers = parsed.nodes.filter((n) => n.type === "trigger");
  if (triggers.length !== 1) throw new Error("Workflow must contain exactly one trigger node");
  for (const e of parsed.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      throw new Error(`Edge ${e.id} references unknown node`);
    }
    if (e.source === e.target) throw new Error(`Edge ${e.id} is a self-loop`);
  }
  return parsed as WorkflowDefinition;
}

export function workflowNeedsConfirmation(def: WorkflowDefinition): boolean {
  return def.nodes.some((n) => n.type === "send_message" || n.type === "webhook" || n.type === "http_request");
}

export * from "./engine.js";
