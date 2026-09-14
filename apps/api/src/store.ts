/**
 * Tenant-safe persistence boundary for the API.
 * Every method takes organizationId explicitly — route handlers pass it from
 * the session-derived TenantContext, never from client input.
 */

export interface WorkspaceRecord {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
}

export interface ConnectionRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  product: string;
  status: string;
  scopes: string[];
  encryptedToken: string | null;
  tokenExpiresAt: string | null;
  metaUserId: string | null;
  webhookStatus: string | null;
  lastEventAt: string | null;
  lastHealthAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetInput {
  metaId: string;
  type: string;
  product: string;
  name: string;
  parentMetaId?: string;
  encryptedToken?: string;
}

export interface AssetRecord {
  id: string;
  connectionId: string;
  organizationId: string;
  workspaceId: string;
  type: string;
  product: string;
  name: string;
  metaId: string;
  parentId: string | null;
  healthy: boolean;
  encryptedToken: string | null;
}

export interface ConnectionUpsert {
  organizationId: string;
  workspaceId: string;
  product: string;
  status: string;
  scopes: string[];
  encryptedToken: string;
  tokenExpiresAt: string | null;
  metaUserId: string | null;
}

export interface Store {
  // Workspaces
  createWorkspace(organizationId: string, name: string): Promise<WorkspaceRecord>;
  getWorkspace(id: string, organizationId: string): Promise<WorkspaceRecord | null>;

  // Connections
  upsertConnection(input: ConnectionUpsert): Promise<ConnectionRecord>;
  getConnection(id: string, organizationId: string): Promise<ConnectionRecord | null>;
  listConnections(organizationId: string, workspaceId?: string): Promise<ConnectionRecord[]>;
  updateConnection(
    id: string,
    organizationId: string,
    patch: Partial<Pick<ConnectionRecord, "status" | "scopes" | "webhookStatus" | "lastEventAt" | "lastHealthAt">>,
  ): Promise<ConnectionRecord>;
  deleteConnection(id: string, organizationId: string): Promise<void>;

  // Assets
  replaceAssets(connectionId: string, organizationId: string, assets: AssetInput[]): Promise<AssetRecord[]>;
  listAssets(organizationId: string, workspaceId?: string): Promise<AssetRecord[]>;

  // Audit
  audit(organizationId: string, userId: string | null, action: string, target?: string): Promise<void>;

  // AI usage (cost control)
  recordAiUsage(
    organizationId: string,
    usage: { model: string; tokensIn: number; tokensOut: number; costCents: number; requestType: string; latencyMs: number },
  ): Promise<void>;
  sumAiUsageCostSince(organizationId: string, sinceIso: string): Promise<number>;
}
