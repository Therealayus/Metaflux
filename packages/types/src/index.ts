// @metaflux/types — shared domain DTOs. No runtime deps.

export type Provider = "meta";
export type MetaProduct = "instagram" | "whatsapp" | "facebook";
export type TenantRole = "owner" | "admin" | "member" | "viewer";

export interface TenantContext {
  userId: string;
  organizationId: string;
  workspaceId?: string;
  role: TenantRole;
  requestId: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
}

export interface MetaConnectionSummary {
  id: string;
  product: MetaProduct;
  status: "connected" | "action_required" | "disconnected";
  assetCount: number;
  lastEventAt?: string;
}

export type WorkflowNodeType =
  | "trigger"
  | "condition"
  | "filter"
  | "delay"
  | "ai"
  | "send_message"
  | "create_lead"
  | "webhook"
  | "http_request"
  | "branch"
  | "transform"
  | "log";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export type ExecutionStatus = "queued" | "running" | "succeeded" | "failed" | "retried" | "dead_letter";

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
}
