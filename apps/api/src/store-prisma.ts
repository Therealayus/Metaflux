import { getPrisma } from "@metaflux/database";
import type { AssetInput, AssetRecord, ConnectionRecord, ConnectionUpsert, Store, WorkspaceRecord } from "./store.js";

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
