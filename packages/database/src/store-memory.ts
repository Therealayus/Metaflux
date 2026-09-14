import type {
  AssetInput,
  AssetRecord,
  ConnectionRecord,
  ConnectionUpsert,
  EventInput,
  EventList,
  EventPatch,
  EventRecord,
  Store,
  WorkspaceRecord,
} from "./store.js";
import { decodeEventCursor, encodeEventCursor } from "./store.js";

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

  events = new Map<string, EventRecord>();
  eventsByEventId = new Map<string, string>();

  async createEvent(input: EventInput): Promise<{ record: EventRecord; created: boolean }> {
    const existingId = this.eventsByEventId.get(`${input.organizationId}:${input.eventId}`);
    if (existingId) {
      const existing = this.events.get(existingId);
      if (existing) return { record: existing, created: false };
    }
    const rec: EventRecord = {
      id: cuid("evt"),
      organizationId: input.organizationId,
      workspaceId: input.workspaceId ?? null,
      provider: input.provider,
      product: input.product,
      eventType: input.eventType,
      eventId: input.eventId,
      status: "received",
      attemptCount: 0,
      payloadRef: input.payloadRef ?? null,
      payload: input.payload ?? null,
      error: null,
      receivedAt: new Date().toISOString(),
      processedAt: null,
    };
    this.events.set(rec.id, rec);
    this.eventsByEventId.set(`${input.organizationId}:${input.eventId}`, rec.id);
    return { record: rec, created: true };
  }

  async getEvent(id: string, organizationId: string): Promise<EventRecord | null> {
    const e = this.events.get(id);
    return e && e.organizationId === organizationId ? e : null;
  }

  async listEvents(
    organizationId: string,
    opts: { cursor?: string; limit?: number; product?: string; status?: string; workspaceId?: string },
  ): Promise<EventList> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    let items = [...this.events.values()]
      .filter(
        (e) =>
          e.organizationId === organizationId &&
          (!opts.product || e.product === opts.product) &&
          (!opts.status || e.status === opts.status) &&
          (!opts.workspaceId || e.workspaceId === opts.workspaceId),
      )
      .sort((a, b) => (b.receivedAt.localeCompare(a.receivedAt) || b.id.localeCompare(a.id)));
    if (opts.cursor) {
      const { receivedAt, id } = decodeEventCursor(opts.cursor);
      items = items.filter((e) => e.receivedAt < receivedAt || (e.receivedAt === receivedAt && e.id < id));
    }
    const page = items.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map(({ payload: _p, ...rest }) => ({ ...rest, payload: null })),
      nextCursor: items.length > limit && last ? encodeEventCursor(last.receivedAt, last.id) : undefined,
    };
  }

  async updateEvent(id: string, organizationId: string, patch: EventPatch): Promise<EventRecord> {
    const e = await this.getEvent(id, organizationId);
    if (!e) throw Object.assign(new Error("Event not found"), { status: 404 });
    const updated: EventRecord = {
      ...e,
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.attemptCount !== undefined ? { attemptCount: patch.attemptCount } : {}),
      ...(patch.processedAt !== undefined ? { processedAt: patch.processedAt } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    };
    this.events.set(id, updated);
    return updated;
  }

  async deleteEventsBefore(beforeIso: string): Promise<number> {
    let n = 0;
    for (const [id, e] of this.events) {
      if (e.receivedAt <= beforeIso) {
        this.events.delete(id);
        this.eventsByEventId.delete(`${e.organizationId}:${e.eventId}`);
        n += 1;
      }
    }
    return n;
  }

  async findConnectionByAssetMetaId(metaId: string): Promise<{
    connection: ConnectionRecord;
    organizationId: string;
    workspaceId: string;
  } | null> {
    const asset = [...this.assets.values()].find((a) => a.metaId === metaId);
    if (!asset) return null;
    const connection = this.connections.get(asset.connectionId);
    if (!connection) return null;
    return { connection, organizationId: connection.organizationId, workspaceId: connection.workspaceId };
  }
}
