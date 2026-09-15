import { createHash } from "node:crypto";
import type { Cache } from "./cache.js";

export interface FlagValue {
  enabled: boolean;
  /** 0-100 rollout. Evaluated against hash(flag, scope id). */
  percentage?: number;
  allowOrgs?: string[];
  denyOrgs?: string[];
}

export interface FlagContext {
  organizationId?: string;
  workspaceId?: string;
  userId?: string;
}

const GLOBAL_KEY = "flags:all";

async function readAll(cache: Cache): Promise<Record<string, FlagValue>> {
  return (await cache.getJson<Record<string, FlagValue>>(GLOBAL_KEY)) ?? {};
}

/** Pure evaluation — unit-testable without any backend. */
export function evaluateFlag(flag: FlagValue | undefined, ctx: FlagContext, defaultValue: boolean): boolean {
  if (!flag) return defaultValue;
  if (ctx.organizationId && flag.denyOrgs?.includes(ctx.organizationId)) return false;
  if (ctx.organizationId && flag.allowOrgs && flag.allowOrgs.length > 0) {
    return flag.allowOrgs.includes(ctx.organizationId);
  }
  if (flag.percentage !== undefined) {
    const scope = ctx.userId ?? ctx.organizationId ?? ctx.workspaceId ?? "global";
    const hash = createHash("sha256").update(`${scope}`).digest();
    const pct = (hash[0] as number) % 100;
    return pct < Math.min(Math.max(flag.percentage, 0), 100);
  }
  return flag.enabled;
}

export async function isEnabled(cache: Cache, flag: string, ctx: FlagContext = {}, defaultValue = false): Promise<boolean> {
  const all = await readAll(cache);
  return evaluateFlag(all[flag], ctx, defaultValue);
}

/** Set or replace a flag. Values are validated, never trusted blindly. */
export async function setFlag(cache: Cache, flag: string, value: FlagValue): Promise<void> {
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(flag)) throw new Error("Invalid flag name");
  if (value.percentage !== undefined && (!Number.isInteger(value.percentage) || value.percentage < 0 || value.percentage > 100)) {
    throw new Error("percentage must be an integer 0-100");
  }
  const all = await readAll(cache);
  all[flag] = { enabled: Boolean(value.enabled), percentage: value.percentage, allowOrgs: value.allowOrgs ?? [], denyOrgs: value.denyOrgs ?? [] };
  await cache.setJson(GLOBAL_KEY, all, 86400);
}

export async function listFlags(cache: Cache): Promise<Record<string, FlagValue>> {
  return readAll(cache);
}

export async function deleteFlag(cache: Cache, flag: string): Promise<void> {
  const all = await readAll(cache);
  delete all[flag];
  await cache.setJson(GLOBAL_KEY, all, 86400);
}
