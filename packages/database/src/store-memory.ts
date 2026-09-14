import type {
  ApiKeyPublic,
  ApiKeyRecord,
  ApiRequestRecord,
  AssetInput,
  AssetRecord,
  ConnectionRecord,
  ConnectionUpsert,
  EventInput,
  EventList,
  EventPatch,
  EventRecord,
  ExecutionRecord,
  LeadRecord,
  MembershipRecord,
  OrganizationRecord,
  SessionRecord,
  Store,
  UserRecord,
  WorkflowRecord,
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

  workflows = new Map<string, WorkflowRecord>();
  executions = new Map<string, ExecutionRecord>();
  executionsByKey = new Map<string, string>();
  leads = new Map<string, LeadRecord>();

  async createWorkflow(input: { organizationId: string; workspaceId: string; name: string; definition: unknown }): Promise<WorkflowRecord> {
    const ws = await this.getWorkspace(input.workspaceId, input.organizationId);
    if (!ws) throw Object.assign(new Error("Workspace not found"), { status: 404 });
    const now = new Date().toISOString();
    const rec: WorkflowRecord = { id: cuid("wf"), ...input, status: "draft", createdAt: now, updatedAt: now };
    this.workflows.set(rec.id, rec);
    return rec;
  }

  async getWorkflow(id: string, organizationId: string): Promise<WorkflowRecord | null> {
    const w = this.workflows.get(id);
    return w && w.organizationId === organizationId ? w : null;
  }

  async listWorkflows(
    organizationId: string,
    opts: { workspaceId?: string; status?: string; cursor?: string; limit?: number },
  ): Promise<{ items: WorkflowRecord[]; nextCursor?: string }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    let items = [...this.workflows.values()]
      .filter(
        (w) =>
          w.organizationId === organizationId &&
          (!opts.workspaceId || w.workspaceId === opts.workspaceId) &&
          (!opts.status || w.status === opts.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    if (opts.cursor) {
      const { receivedAt, id } = decodeEventCursor(opts.cursor);
      items = items.filter((w) => w.createdAt < receivedAt || (w.createdAt === receivedAt && w.id < id));
    }
    const page = items.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page,
      nextCursor: items.length > limit && last ? encodeEventCursor(last.createdAt, last.id) : undefined,
    };
  }

  async updateWorkflow(
    id: string,
    organizationId: string,
    patch: { name?: string; definition?: unknown; status?: string },
  ): Promise<WorkflowRecord> {
    const w = await this.getWorkflow(id, organizationId);
    if (!w) throw Object.assign(new Error("Workflow not found"), { status: 404 });
    const updated: WorkflowRecord = {
      ...w,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.definition !== undefined ? { definition: patch.definition } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.workflows.set(id, updated);
    return updated;
  }

  async deleteWorkflow(id: string, organizationId: string): Promise<void> {
    const w = await this.getWorkflow(id, organizationId);
    if (!w) throw Object.assign(new Error("Workflow not found"), { status: 404 });
    for (const [eid, e] of this.executions) {
      if (e.workflowId === id) {
        this.executions.delete(eid);
        this.executionsByKey.delete(`${organizationId}:${e.idempotencyKey}`);
      }
    }
    this.workflows.delete(id);
  }

  async createExecution(input: {
    workflowId: string;
    organizationId: string;
    idempotencyKey: string;
    input?: unknown;
  }): Promise<{ record: ExecutionRecord; created: boolean }> {
    const wf = await this.getWorkflow(input.workflowId, input.organizationId);
    if (!wf) throw Object.assign(new Error("Workflow not found"), { status: 404 });
    const key = `${input.organizationId}:${input.idempotencyKey}`;
    const existingId = this.executionsByKey.get(key);
    if (existingId) {
      const existing = this.executions.get(existingId);
      if (existing) return { record: existing, created: false };
    }
    const rec: ExecutionRecord = {
      id: cuid("exe"),
      workflowId: input.workflowId,
      organizationId: input.organizationId,
      status: "queued",
      idempotencyKey: input.idempotencyKey,
      input: input.input ?? null,
      output: null,
      error: null,
      createdAt: new Date().toISOString(),
    };
    this.executions.set(rec.id, rec);
    this.executionsByKey.set(key, rec.id);
    return { record: rec, created: true };
  }

  async getExecution(id: string, organizationId: string): Promise<ExecutionRecord | null> {
    const e = this.executions.get(id);
    return e && e.organizationId === organizationId ? e : null;
  }

  async listExecutions(
    workflowId: string,
    organizationId: string,
    opts: { cursor?: string; limit?: number },
  ): Promise<{ items: ExecutionRecord[]; nextCursor?: string }> {
    const wf = await this.getWorkflow(workflowId, organizationId);
    if (!wf) throw Object.assign(new Error("Workflow not found"), { status: 404 });
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    let items = [...this.executions.values()]
      .filter((e) => e.workflowId === workflowId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    if (opts.cursor) {
      const { receivedAt, id } = decodeEventCursor(opts.cursor);
      items = items.filter((e) => e.createdAt < receivedAt || (e.createdAt === receivedAt && e.id < id));
    }
    const page = items.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page,
      nextCursor: items.length > limit && last ? encodeEventCursor(last.createdAt, last.id) : undefined,
    };
  }

  async updateExecution(
    id: string,
    organizationId: string,
    patch: { status?: string; output?: unknown; error?: string | null },
  ): Promise<ExecutionRecord> {
    const e = await this.getExecution(id, organizationId);
    if (!e) throw Object.assign(new Error("Execution not found"), { status: 404 });
    const updated: ExecutionRecord = {
      ...e,
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.output !== undefined ? { output: patch.output } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    };
    this.executions.set(id, updated);
    return updated;
  }

  async createLead(input: {
    organizationId: string;
    workspaceId: string;
    workflowId?: string;
    name?: string;
    phone?: string;
    email?: string;
    source?: string;
    attributes?: unknown;
  }): Promise<LeadRecord> {
    const rec: LeadRecord = {
      id: cuid("lead"),
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      workflowId: input.workflowId ?? null,
      name: input.name ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      source: input.source ?? "workflow",
      attributes: input.attributes ?? null,
      createdAt: new Date().toISOString(),
    };
    this.leads.set(rec.id, rec);
    return rec;
  }

  async listLeads(
    organizationId: string,
    opts: { workspaceId?: string; cursor?: string; limit?: number },
  ): Promise<{ items: LeadRecord[]; nextCursor?: string }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    let items = [...this.leads.values()]
      .filter((l) => l.organizationId === organizationId && (!opts.workspaceId || l.workspaceId === opts.workspaceId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    if (opts.cursor) {
      const { receivedAt, id } = decodeEventCursor(opts.cursor);
      items = items.filter((l) => l.createdAt < receivedAt || (l.createdAt === receivedAt && l.id < id));
    }
    const page = items.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page,
      nextCursor: items.length > limit && last ? encodeEventCursor(last.createdAt, last.id) : undefined,
    };
  }

  users = new Map<string, UserRecord>();
  usersByEmail = new Map<string, string>();
  organizations = new Map<string, OrganizationRecord>();
  memberships = new Map<string, MembershipRecord>();
  sessions = new Map<string, SessionRecord>();
  apiKeys = new Map<string, ApiKeyRecord>();
  apiRequests: ApiRequestRecord[] = [];

  async createUser(input: { email: string; passwordHash?: string; name?: string }): Promise<UserRecord> {
    const email = input.email.toLowerCase().trim();
    if (this.usersByEmail.has(email)) throw Object.assign(new Error("Email already registered"), { status: 409 });
    const rec: UserRecord = {
      id: cuid("user"),
      email,
      passwordHash: input.passwordHash ?? null,
      name: input.name ?? null,
      emailVerifiedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.users.set(rec.id, rec);
    this.usersByEmail.set(email, rec.id);
    return rec;
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const id = this.usersByEmail.get(email.toLowerCase().trim());
    return id ? (this.users.get(id) ?? null) : null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async createOrganization(input: { name: string; slug: string }): Promise<OrganizationRecord> {
    if ([...this.organizations.values()].some((o) => o.slug === input.slug)) {
      throw Object.assign(new Error("Organization slug taken"), { status: 409 });
    }
    const rec: OrganizationRecord = { id: cuid("org"), ...input, createdAt: new Date().toISOString() };
    this.organizations.set(rec.id, rec);
    return rec;
  }

  async createMembership(userId: string, organizationId: string, role: string): Promise<MembershipRecord> {
    const rec: MembershipRecord = { id: cuid("mem"), userId, organizationId, role, createdAt: new Date().toISOString() };
    this.memberships.set(rec.id, rec);
    return rec;
  }

  async getMembership(userId: string, organizationId: string): Promise<MembershipRecord | null> {
    return [...this.memberships.values()].find((m) => m.userId === userId && m.organizationId === organizationId) ?? null;
  }

  async listUserMemberships(userId: string): Promise<Array<MembershipRecord & { organization: OrganizationRecord }>> {
    return [...this.memberships.values()]
      .filter((m) => m.userId === userId)
      .map((m) => ({ ...m, organization: this.organizations.get(m.organizationId) as OrganizationRecord }))
      .filter((m) => m.organization);
  }

  async createSession(userId: string, tokenHash: string, expiresAt: string): Promise<SessionRecord> {
    const rec: SessionRecord = { id: cuid("sess"), userId, tokenHash, expiresAt, createdAt: new Date().toISOString() };
    this.sessions.set(rec.id, rec);
    return rec;
  }

  async getSessionByTokenHash(tokenHash: string): Promise<(SessionRecord & { user: UserRecord }) | null> {
    const sess = [...this.sessions.values()].find((s) => s.tokenHash === tokenHash);
    if (!sess) return null;
    if (sess.expiresAt < new Date().toISOString()) {
      this.sessions.delete(sess.id);
      return null;
    }
    const user = this.users.get(sess.userId);
    if (!user) return null;
    return { ...sess, user };
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    const u = this.users.get(userId);
    if (!u) throw Object.assign(new Error("User not found"), { status: 404 });
    this.users.set(userId, { ...u, passwordHash });
  }

  resets = new Map<string, { userId: string; expiresAt: string; usedAt: string | null }>();

  async createPasswordReset(userId: string, tokenHash: string, expiresAt: string): Promise<void> {
    this.resets.set(tokenHash, { userId, expiresAt, usedAt: null });
  }

  async consumePasswordReset(tokenHash: string): Promise<string | null> {
    const r = this.resets.get(tokenHash);
    if (!r || r.usedAt || r.expiresAt < new Date().toISOString()) return null;
    this.resets.set(tokenHash, { ...r, usedAt: new Date().toISOString() });
    return r.userId;
  }

  async createApiKey(input: {
    organizationId: string;
    name: string;
    prefix: string;
    keyHash: string;
    scopes: string[];
    expiresAt?: string | null;
  }): Promise<ApiKeyRecord> {
    const rec: ApiKeyRecord = {
      id: cuid("key"),
      organizationId: input.organizationId,
      name: input.name,
      prefix: input.prefix,
      keyHash: input.keyHash,
      scopes: input.scopes,
      expiresAt: input.expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.apiKeys.set(rec.id, rec);
    return rec;
  }

  async listApiKeys(organizationId: string): Promise<ApiKeyPublic[]> {
    return [...this.apiKeys.values()]
      .filter((k) => k.organizationId === organizationId)
      .map(({ keyHash: _h, ...rest }) => rest);
  }

  async getApiKeyByPrefix(prefix: string): Promise<ApiKeyRecord | null> {
    return [...this.apiKeys.values()].find((k) => k.prefix === prefix) ?? null;
  }

  async touchApiKey(id: string): Promise<void> {
    const k = this.apiKeys.get(id);
    if (k) this.apiKeys.set(id, { ...k, lastUsedAt: new Date().toISOString() });
  }

  async revokeApiKey(id: string, organizationId: string): Promise<void> {
    const k = this.apiKeys.get(id);
    if (!k || k.organizationId !== organizationId) throw Object.assign(new Error("API key not found"), { status: 404 });
    this.apiKeys.set(id, { ...k, revokedAt: new Date().toISOString() });
  }

  async appendApiRequest(input: {
    organizationId: string;
    keyId?: string | null;
    method: string;
    path: string;
    status: number;
    latencyMs: number;
    requestId?: string;
  }): Promise<void> {
    this.apiRequests.push({
      id: cuid("req"),
      organizationId: input.organizationId,
      keyId: input.keyId ?? null,
      method: input.method,
      path: input.path,
      status: input.status,
      latencyMs: input.latencyMs,
      requestId: input.requestId ?? null,
      createdAt: new Date().toISOString(),
    });
    if (this.apiRequests.length > 5000) this.apiRequests.splice(0, this.apiRequests.length - 5000);
  }

  async listApiRequests(
    organizationId: string,
    opts: { keyId?: string; status?: number; cursor?: string; limit?: number },
  ): Promise<{ items: ApiRequestRecord[]; nextCursor?: string }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    let items = this.apiRequests
      .filter(
        (r) =>
          r.organizationId === organizationId &&
          (!opts.keyId || r.keyId === opts.keyId) &&
          (opts.status === undefined || r.status === opts.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    if (opts.cursor) {
      const { receivedAt, id } = decodeEventCursor(opts.cursor);
      items = items.filter((r) => r.createdAt < receivedAt || (r.createdAt === receivedAt && r.id < id));
    }
    const page = items.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page,
      nextCursor: items.length > limit && last ? encodeEventCursor(last.createdAt, last.id) : undefined,
    };
  }

  async getApiRequest(id: string, organizationId: string): Promise<ApiRequestRecord | null> {
    const r = this.apiRequests.find((x) => x.id === id);
    return r && r.organizationId === organizationId ? r : null;
  }

  async countApiRequests(organizationId: string, sinceIso: string): Promise<number> {
    return this.apiRequests.filter((r) => r.organizationId === organizationId && r.createdAt >= sinceIso).length;
  }
}
