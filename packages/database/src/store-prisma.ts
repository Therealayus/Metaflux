import { getPrisma } from "./prisma.js";
import type {
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
  Store,
  WorkflowRecord,
  WorkspaceRecord,
} from "./store.js";
import { decodeEventCursor, encodeEventCursor } from "./store.js";

function toConnection(c: {
  id: string; organizationId: string; workspaceId: string; product: string; status: string;
  scopes: string[]; encryptedToken: string | null; tokenExpiresAt: Date | null; metaUserId: string | null;
  webhookStatus: string | null; lastEventAt: Date | null; lastHealthAt: Date | null;
  createdAt: Date; updatedAt: Date;
}): ConnectionRecord {
  return {
    ...c,
    tokenExpiresAt: c.tokenExpiresAt?.toISOString() ?? null,
    lastEventAt: c.lastEventAt?.toISOString() ?? null,
    lastHealthAt: c.lastHealthAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Postgres-backed Store. All queries scoped by organizationId. */
export class PrismaStore implements Store {
  async createWorkspace(organizationId: string, name: string): Promise<WorkspaceRecord> {
    const w = await getPrisma().workspace.create({ data: { organizationId, name } });
    return { ...w, createdAt: w.createdAt.toISOString() };
  }

  async getWorkspace(id: string, organizationId: string): Promise<WorkspaceRecord | null> {
    const w = await getPrisma().workspace.findFirst({ where: { id, organizationId } });
    return w ? { ...w, createdAt: w.createdAt.toISOString() } : null;
  }

  async upsertConnection(input: ConnectionUpsert): Promise<ConnectionRecord> {
    const c = await getPrisma().metaConnection.upsert({
      where: {
        organizationId_workspaceId_product: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          product: input.product,
        },
      },
      create: { ...input, tokenExpiresAt: input.tokenExpiresAt ? new Date(input.tokenExpiresAt) : null },
      update: { ...input, tokenExpiresAt: input.tokenExpiresAt ? new Date(input.tokenExpiresAt) : null },
    });
    return toConnection(c);
  }

  async getConnection(id: string, organizationId: string): Promise<ConnectionRecord | null> {
    const c = await getPrisma().metaConnection.findFirst({ where: { id, organizationId } });
    return c ? toConnection(c) : null;
  }

  async listConnections(organizationId: string, workspaceId?: string): Promise<ConnectionRecord[]> {
    const rows = await getPrisma().metaConnection.findMany({
      where: { organizationId, ...(workspaceId ? { workspaceId } : {}) },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toConnection);
  }

  async updateConnection(
    id: string,
    organizationId: string,
    patch: Partial<Pick<ConnectionRecord, "status" | "scopes" | "webhookStatus" | "lastEventAt" | "lastHealthAt">>,
  ): Promise<ConnectionRecord> {
    const existing = await this.getConnection(id, organizationId);
    if (!existing) throw Object.assign(new Error("Connection not found"), { status: 404 });
    const c = await getPrisma().metaConnection.update({
      where: { id },
      data: {
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.scopes ? { scopes: patch.scopes } : {}),
        ...(patch.webhookStatus !== undefined ? { webhookStatus: patch.webhookStatus } : {}),
        ...(patch.lastEventAt ? { lastEventAt: new Date(patch.lastEventAt) } : {}),
        ...(patch.lastHealthAt ? { lastHealthAt: new Date(patch.lastHealthAt) } : {}),
      },
    });
    return toConnection(c);
  }

  async deleteConnection(id: string, organizationId: string): Promise<void> {
    const existing = await this.getConnection(id, organizationId);
    if (!existing) throw Object.assign(new Error("Connection not found"), { status: 404 });
    await getPrisma().metaAsset.deleteMany({ where: { connectionId: id } });
    await getPrisma().metaConnection.delete({ where: { id } });
  }

  async replaceAssets(connectionId: string, organizationId: string, assets: AssetInput[]): Promise<AssetRecord[]> {
    const conn = await this.getConnection(connectionId, organizationId);
    if (!conn) throw Object.assign(new Error("Connection not found"), { status: 404 });
    return getPrisma().$transaction(async (tx) => {
      await tx.metaAsset.deleteMany({ where: { connectionId } });
      const created = await Promise.all(
        assets.map((a) =>
          tx.metaAsset.create({
            data: {
              connectionId,
              type: a.type,
              product: a.product,
              name: a.name,
              metaId: a.metaId,
              encryptedToken: a.encryptedToken ?? null,
            },
          }),
        ),
      );
      const byMetaId = new Map(created.map((c) => [c.metaId, c]));
      for (const a of assets) {
        const parent = a.parentMetaId ? byMetaId.get(a.parentMetaId) : undefined;
        const child = byMetaId.get(a.metaId);
        if (parent && child) {
          await tx.metaAsset.update({ where: { id: child.id }, data: { parentId: parent.id } });
        }
      }
      const final = await tx.metaAsset.findMany({ where: { connectionId } });
      return final.map((r) => ({
        ...r,
        organizationId,
        workspaceId: conn.workspaceId,
        parentId: r.parentId,
        encryptedToken: r.encryptedToken,
      }));
    });
  }

  async listAssets(organizationId: string, workspaceId?: string): Promise<AssetRecord[]> {
    const conns = await getPrisma().metaConnection.findMany({
      where: { organizationId, ...(workspaceId ? { workspaceId } : {}) },
      include: { assets: true },
    });
    return conns.flatMap((c) =>
      c.assets.map((a) => ({
        ...a,
        organizationId,
        workspaceId: c.workspaceId,
        parentId: a.parentId,
        encryptedToken: a.encryptedToken,
      })),
    );
  }

  async audit(organizationId: string, userId: string | null, action: string, target?: string): Promise<void> {
    await getPrisma().auditLog.create({ data: { organizationId, userId, action, target } });
  }

  async recordAiUsage(
    organizationId: string,
    usage: { model: string; tokensIn: number; tokensOut: number; costCents: number; requestType: string; latencyMs: number },
  ): Promise<void> {
    await getPrisma().aiUsage.create({ data: { organizationId, ...usage } });
  }

  async sumAiUsageCostSince(organizationId: string, sinceIso: string): Promise<number> {
    const agg = await getPrisma().aiUsage.aggregate({
      _sum: { costCents: true },
      where: { organizationId, createdAt: { gte: new Date(sinceIso) } },
    });
    return agg._sum.costCents ?? 0;
  }

  private toEvent(e: {
    id: string; organizationId: string; workspaceId: string | null; provider: string; product: string;
    eventType: string; eventId: string; status: string; attemptCount: number; payloadRef: string | null;
    payload: unknown; error: string | null; receivedAt: Date; processedAt: Date | null;
  }): EventRecord {
    return {
      ...e,
      payload: (e.payload ?? null) as unknown,
      receivedAt: e.receivedAt.toISOString(),
      processedAt: e.processedAt?.toISOString() ?? null,
    };
  }

  async createEvent(input: EventInput): Promise<{ record: EventRecord; created: boolean }> {
    try {
      const e = await getPrisma().webhookEvent.create({
        data: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId ?? null,
          provider: input.provider,
          product: input.product,
          eventType: input.eventType,
          eventId: input.eventId,
          payloadRef: input.payloadRef ?? null,
          payload: input.payload === undefined ? undefined : (input.payload as object),
        },
      });
      return { record: this.toEvent({ ...e, payload: e.payload as unknown }), created: true };
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        const existing = await getPrisma().webhookEvent.findUnique({ where: { eventId: input.eventId } });
        if (existing && existing.organizationId === input.organizationId) {
          return { record: this.toEvent({ ...existing, payload: existing.payload as unknown }), created: false };
        }
        // Same Meta eventId under a different org: extremely unlikely (ids embed object+time),
        // but never conflate tenants — acknowledge as duplicate without touching the row.
        const probe = await getPrisma().webhookEvent.findUnique({ where: { eventId: input.eventId } });
        if (probe) {
          return {
            record: this.toEvent({ ...probe, organizationId: input.organizationId, payload: null }),
            created: false,
          };
        }
      }
      throw err;
    }
  }

  async getEvent(id: string, organizationId: string): Promise<EventRecord | null> {
    const e = await getPrisma().webhookEvent.findFirst({ where: { id, organizationId } });
    return e ? this.toEvent({ ...e, payload: e.payload as unknown }) : null;
  }

  async listEvents(
    organizationId: string,
    opts: { cursor?: string; limit?: number; product?: string; status?: string; workspaceId?: string },
  ): Promise<EventList> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    let cursorFilter = {};
    if (opts.cursor) {
      const { receivedAt, id } = decodeEventCursor(opts.cursor);
      const at = new Date(receivedAt);
      cursorFilter = { OR: [{ receivedAt: { lt: at } }, { receivedAt: at, id: { lt: id } }] };
    }
    const rows = await getPrisma().webhookEvent.findMany({
      where: {
        organizationId,
        ...(opts.product ? { product: opts.product } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
        ...cursorFilter,
      },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true, organizationId: true, workspaceId: true, provider: true, product: true,
        eventType: true, eventId: true, status: true, attemptCount: true, payloadRef: true,
        error: true, receivedAt: true, processedAt: true,
      },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        ...r,
        payload: null,
        receivedAt: r.receivedAt.toISOString(),
        processedAt: r.processedAt?.toISOString() ?? null,
      })),
      nextCursor: rows.length > limit && last ? encodeEventCursor(last.receivedAt.toISOString(), last.id) : undefined,
    };
  }

  async updateEvent(id: string, organizationId: string, patch: EventPatch): Promise<EventRecord> {
    const existing = await this.getEvent(id, organizationId);
    if (!existing) throw Object.assign(new Error("Event not found"), { status: 404 });
    const e = await getPrisma().webhookEvent.update({
      where: { id },
      data: {
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.attemptCount !== undefined ? { attemptCount: patch.attemptCount } : {}),
        ...(patch.processedAt !== undefined ? { processedAt: patch.processedAt ? new Date(patch.processedAt) : null } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
      },
    });
    return this.toEvent({ ...e, payload: e.payload as unknown });
  }

  async deleteEventsBefore(beforeIso: string): Promise<number> {
    const res = await getPrisma().webhookEvent.deleteMany({ where: { receivedAt: { lte: new Date(beforeIso) } } });
    return res.count;
  }

  async findConnectionByAssetMetaId(metaId: string): Promise<{
    connection: ConnectionRecord;
    organizationId: string;
    workspaceId: string;
  } | null> {
    const asset = await getPrisma().metaAsset.findFirst({ where: { metaId } });
    if (!asset) return null;
    const c = await getPrisma().metaConnection.findUnique({ where: { id: asset.connectionId } });
    if (!c) return null;
    return {
      connection: toConnection(c),
      organizationId: c.organizationId,
      workspaceId: c.workspaceId,
    };
  }

  private toWorkflow(w: {
    id: string; organizationId: string; workspaceId: string; name: string;
    definition: unknown; status: string; createdAt: Date; updatedAt: Date;
  }): WorkflowRecord {
    return { ...w, createdAt: w.createdAt.toISOString(), updatedAt: w.updatedAt.toISOString() };
  }

  async createWorkflow(input: { organizationId: string; workspaceId: string; name: string; definition: unknown }): Promise<WorkflowRecord> {
    const ws = await this.getWorkspace(input.workspaceId, input.organizationId);
    if (!ws) throw Object.assign(new Error("Workspace not found"), { status: 404 });
    const w = await getPrisma().workflow.create({
      data: { organizationId: input.organizationId, workspaceId: input.workspaceId, name: input.name, definition: input.definition as object },
    });
    return this.toWorkflow(w);
  }

  async getWorkflow(id: string, organizationId: string): Promise<WorkflowRecord | null> {
    const w = await getPrisma().workflow.findFirst({ where: { id, organizationId } });
    return w ? this.toWorkflow(w) : null;
  }

  async listWorkflows(
    organizationId: string,
    opts: { workspaceId?: string; status?: string; cursor?: string; limit?: number },
  ): Promise<{ items: WorkflowRecord[]; nextCursor?: string }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    let cursorFilter = {};
    if (opts.cursor) {
      const { receivedAt, id } = decodeEventCursor(opts.cursor);
      const at = new Date(receivedAt);
      cursorFilter = { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }] };
    }
    const rows = await getPrisma().workflow.findMany({
      where: {
        organizationId,
        ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        ...cursorFilter,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((w) => this.toWorkflow(w)),
      nextCursor: rows.length > limit && last ? encodeEventCursor(last.createdAt.toISOString(), last.id) : undefined,
    };
  }

  async updateWorkflow(
    id: string,
    organizationId: string,
    patch: { name?: string; definition?: unknown; status?: string },
  ): Promise<WorkflowRecord> {
    const existing = await this.getWorkflow(id, organizationId);
    if (!existing) throw Object.assign(new Error("Workflow not found"), { status: 404 });
    const w = await getPrisma().workflow.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.definition !== undefined ? { definition: patch.definition as object } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      },
    });
    return this.toWorkflow(w);
  }

  async deleteWorkflow(id: string, organizationId: string): Promise<void> {
    const existing = await this.getWorkflow(id, organizationId);
    if (!existing) throw Object.assign(new Error("Workflow not found"), { status: 404 });
    await getPrisma().workflowExecution.deleteMany({ where: { workflowId: id } });
    await getPrisma().workflow.delete({ where: { id } });
  }

  private toExecution(e: {
    id: string; workflowId: string; status: string; idempotencyKey: string;
    input: unknown; output: unknown; error: string | null; createdAt: Date;
  }, organizationId: string): ExecutionRecord {
    return {
      ...e,
      organizationId,
      input: (e.input ?? null) as unknown,
      output: (e.output ?? null) as unknown,
      createdAt: e.createdAt.toISOString(),
    };
  }

  private async executionOrg(workflowId: string, organizationId: string): Promise<void> {
    const wf = await this.getWorkflow(workflowId, organizationId);
    if (!wf) throw Object.assign(new Error("Workflow not found"), { status: 404 });
  }

  async createExecution(input: {
    workflowId: string;
    organizationId: string;
    idempotencyKey: string;
    input?: unknown;
  }): Promise<{ record: ExecutionRecord; created: boolean }> {
    await this.executionOrg(input.workflowId, input.organizationId);
    try {
      const e = await getPrisma().workflowExecution.create({
        data: {
          workflowId: input.workflowId,
          idempotencyKey: input.idempotencyKey,
          input: (input.input ?? {}) as object,
        },
      });
      return { record: this.toExecution(e, input.organizationId), created: true };
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        const existing = await getPrisma().workflowExecution.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing) {
          const wf = await getPrisma().workflow.findUnique({ where: { id: existing.workflowId } });
          if (wf && wf.organizationId === input.organizationId) {
            return { record: this.toExecution(existing, input.organizationId), created: false };
          }
        }
      }
      throw err;
    }
  }

  async getExecution(id: string, organizationId: string): Promise<ExecutionRecord | null> {
    const e = await getPrisma().workflowExecution.findUnique({ where: { id }, include: { workflow: true } });
    if (!e || e.workflow.organizationId !== organizationId) return null;
    return this.toExecution(e, organizationId);
  }

  async listExecutions(
    workflowId: string,
    organizationId: string,
    opts: { cursor?: string; limit?: number },
  ): Promise<{ items: ExecutionRecord[]; nextCursor?: string }> {
    await this.executionOrg(workflowId, organizationId);
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    let cursorFilter = {};
    if (opts.cursor) {
      const { receivedAt, id } = decodeEventCursor(opts.cursor);
      const at = new Date(receivedAt);
      cursorFilter = { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }] };
    }
    const rows = await getPrisma().workflowExecution.findMany({
      where: { workflowId, ...cursorFilter },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((e) => this.toExecution(e, organizationId)),
      nextCursor: rows.length > limit && last ? encodeEventCursor(last.createdAt.toISOString(), last.id) : undefined,
    };
  }

  async updateExecution(
    id: string,
    organizationId: string,
    patch: { status?: string; output?: unknown; error?: string | null },
  ): Promise<ExecutionRecord> {
    const existing = await this.getExecution(id, organizationId);
    if (!existing) throw Object.assign(new Error("Execution not found"), { status: 404 });
    const e = await getPrisma().workflowExecution.update({
      where: { id },
      data: {
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.output !== undefined ? { output: patch.output as object } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
      },
    });
    return this.toExecution(e, organizationId);
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
    const l = await getPrisma().lead.create({
      data: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        workflowId: input.workflowId ?? null,
        name: input.name ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        source: input.source ?? "workflow",
        attributes: (input.attributes ?? undefined) as object | undefined,
      },
    });
    return { ...l, attributes: (l.attributes ?? null) as unknown, createdAt: l.createdAt.toISOString() };
  }

  async listLeads(
    organizationId: string,
    opts: { workspaceId?: string; cursor?: string; limit?: number },
  ): Promise<{ items: LeadRecord[]; nextCursor?: string }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    let cursorFilter = {};
    if (opts.cursor) {
      const { receivedAt, id } = decodeEventCursor(opts.cursor);
      const at = new Date(receivedAt);
      cursorFilter = { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }] };
    }
    const rows = await getPrisma().lead.findMany({
      where: {
        organizationId,
        ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
        ...cursorFilter,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((l) => ({ ...l, attributes: (l.attributes ?? null) as unknown, createdAt: l.createdAt.toISOString() })),
      nextCursor: rows.length > limit && last ? encodeEventCursor(last.createdAt.toISOString(), last.id) : undefined,
    };
  }
}

let cached: Store | null = null;

/** Driver selected by STORE_DRIVER (memory for tests/dev-without-db, prisma otherwise). */
export async function getStore(): Promise<Store> {
  if (cached) return cached;
  if (process.env.STORE_DRIVER === "memory") {
    const { MemoryStore } = await import("./store-memory.js");
    cached = new MemoryStore();
  } else {
    cached = new PrismaStore();
  }
  return cached;
}

/** Test-only reset of the cached driver. */
export function __resetStoreForTests(): void {
  cached = null;
}
