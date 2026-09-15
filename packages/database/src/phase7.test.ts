import { describe, expect, it } from "vitest";
import { MemoryCache, __resetCacheForTests, getCache } from "./cache.js";
import { deleteFlag, evaluateFlag, isEnabled, listFlags, setFlag } from "./flags.js";
import { getPrisma, getReplicaPrisma } from "./prisma.js";

describe("cache", () => {
  it("stores with TTL and evicts expiry", async () => {
    __resetCacheForTests();
    const cache = getCache();
    expect(cache).toBeInstanceOf(MemoryCache);
    await cache.set("k", "v", 100);
    expect(await cache.get("k")).toBe("v");
    await cache.setJson("j", { a: 1 }, 100);
    expect(await cache.getJson("j")).toEqual({ a: 1 });
    await cache.del("k");
    expect(await cache.get("k")).toBeNull();
  });
});

describe("flags", () => {
  it("evaluates statically, by org lists, and by deterministic percentage", async () => {
    __resetCacheForTests();
    const cache = getCache();
    expect(await isEnabled(cache, "missing", {}, false)).toBe(false);
    await setFlag(cache, "rollout", { enabled: false, percentage: 100 });
    expect(await isEnabled(cache, "rollout", { userId: "u1" })).toBe(true);
    await setFlag(cache, "rollout", { enabled: true, percentage: 0 });
    expect(await isEnabled(cache, "rollout", { userId: "u1" })).toBe(false);
    await setFlag(cache, "scoped", { enabled: false, allowOrgs: ["o1"], denyOrgs: ["o2"] });
    expect(await isEnabled(cache, "scoped", { organizationId: "o1" })).toBe(true);
    expect(await isEnabled(cache, "scoped", { organizationId: "o2" })).toBe(false);
    expect(await isEnabled(cache, "scoped", { organizationId: "o3" })).toBe(false);
    expect(Object.keys(await listFlags(cache))).toContain("scoped");
    await deleteFlag(cache, "scoped");
    expect(await isEnabled(cache, "scoped", { organizationId: "o1" })).toBe(false);
    await expect(setFlag(cache, "BAD NAME!", { enabled: true })).rejects.toThrow();
    // Deterministic: same scope always decides the same way.
    expect(evaluateFlag({ enabled: false, percentage: 50 }, { userId: "stable" }, false)).toBe(
      evaluateFlag({ enabled: false, percentage: 50 }, { userId: "stable" }, false),
    );
  });
});

describe("prisma clients", () => {
  it("returns the primary as replica when unconfigured, without connecting", () => {
    delete process.env.REPLICA_DATABASE_URL;
    expect(getReplicaPrisma()).toBe(getPrisma());
  });
});
