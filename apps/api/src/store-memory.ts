import type { AssetInput, AssetRecord, ConnectionRecord, ConnectionUpsert, Store, WorkspaceRecord } from "./store.js";

function cuid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory Store for tests and local dev without Postgres. Tenant isolation enforced identically. */
export class MemoryStore implements Store {
  workspaces = new Map<string, WorkspaceRecord>();
  connections = new Map<string, ConnectionRecord>();
  assets = new Map<string, AssetRecord>();
  auditLog: Array<{ organizationId: string; userId: string | null; action: string; target?: string }> = [];

  async createWorkspace(organizationId: string, name: string): Promise<WorkspaceRecord> {
    const ws = { id: cuid("ws"), organizationId, name, createdAt: new Date().toISOString() };
    this.workspaces.set(ws.id, ws);
    return ws;
  }

  async getWorkspace(id: string, organizationId: string): Promise<WorkspaceRecord | null> {
    const ws = this.workspaces.get(id);
    return ws && ws.organizationId === organizationId ? ws : null;
  }

  async upsertConnection(input: ConnectionUpsert): Promise<ConnectionRecord> {
    const existing = [...this.connections.values()].find(
      (c) =>
        c.organizationId === input.organizationId &&
        c.workspaceId === input.workspaceId &&
        c.product === input.product,
    );
    const now = new Date().toISOString();
    if (existing) {
      const updated: ConnectionRecord = { ...existing, ...input, updatedAt: now };
      this.connections.set(existing.id, updated);
      return updated;
    }
    const rec: ConnectionRecord = { id: cuid("conn"), ...input, webhookStatus: null, lastEventAt: null, lastHealthAt: null, createdAt: now, updatedAt: now };
    this.connections.set(rec.id, rec);
    return rec;
  }

  async getConnection(id: string, organizationId: string): Promise<ConnectionRecord | null> {
    const c = this.connections.get(id);
    return c && c.organizationId === organizationId ? c : null;
  }

  async listConnections(organizationId: string, workspaceId?: string): Promise<ConnectionRecord[]> {
    return [...this.connections.values()].filter(
      (c) => c.organizationId === organizationId && (!workspaceId || c.workspaceId === workspaceId),
    );
  }

  async updateConnection(
    id: string,
    organizationId: string,
    patch: Partial<Pick<ConnectionRecord, "status" | "scopes" | "webhookStatus" | "lastEventAt" | "lastHealthAt">>,
  ): Promise<ConnectionRecord> {
    const c = await this.getConnection(id, organizationId);
    if (!c) throw Object.assign(new Error("Connection not found"), { status: 404 });
    const updated = { ...c, ...patch, updatedAt: new Date().toISOString() };
    this.connections.set(id, updated);
    return updated;
  }

  async deleteConnection(id: string, organizationId: string): Promise<void> {
    const c = await this.getConnection(id, organizationId);
    if (!c) throw Object.assign(new Error("Connection not found"), { status: 404 });
    for (const [aid, a] of this.assets) {
      if (a.connectionId === id) this.assets.delete(aid);
    }
    this.connections.delete(id);
  }

  async replaceAssets(connectionId: string, organizationId: string, assets: AssetInput[]): Promise<AssetRecord[]> {
    const conn = await this.getConnection(connectionId, organizationId);
    if (!conn) throw Object.assign(new Error("Connection not found"), { status: 404 });
    for (const [aid, a] of this.assets) {
      if (a.connectionId === connectionId) this.assets.delete(aid);
    }
    const byMetaId = new Map<string, AssetRecord>();
    for (const a of assets) {
      const rec: AssetRecord = {
        id: cuid("asset"),
        connectionId,
        organizationId,
        workspaceId: conn.workspaceId,
        type: a.type,
        product: a.product,
        name: a.name,
        metaId: a.metaId,
        parentId: null,
        healthy: true,
        encryptedToken: a.encryptedToken ?? null,
      };
      this.assets.set(rec.id, rec);
      byMetaId.set(a.metaId, rec);
    }
    for (const a of assets) {
      if (a.parentMetaId && byMetaId.has(a.parentMetaId)) {
        const rec = byMetaId.get(a.metaId);
        if (rec) rec.parentId = byMetaId.get(a.parentMetaId)?.id ?? null;
      }
    }
    return [...byMetaId.values()];
  }

  async listAssets(organizationId: string, workspaceId?: string): Promise<AssetRecord[]> {
    return [...this.assets.values()].filter(
      (a) => a.organizationId === organizationId && (!workspaceId || a.workspaceId === workspaceId),
    );
  }

  async audit(organizationId: string, userId: string | null, action: string, target?: string): Promise<void> {
    this.auditLog.push({ organizationId, userId, action, target });
  }

  aiUsage: Array<{ organizationId: string; costCents: number; createdAt: string }> = [];

  async recordAiUsage(
    organizationId: string,
    usage: { model: string; tokensIn: number; tokensOut: number; costCents: number; requestType: string; latencyMs: number },
  ): Promise<void> {
    this.aiUsage.push({ organizationId, costCents: usage.costCents, createdAt: new Date().toISOString() });
  }

  async sumAiUsageCostSince(organizationId: string, sinceIso: string): Promise<number> {
    return this.aiUsage
      .filter((r) => r.organizationId === organizationId && r.createdAt >= sinceIso)
      .reduce((sum, r) => sum + r.costCents, 0);
  }
}
