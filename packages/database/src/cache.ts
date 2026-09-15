import { Redis } from "ioredis";

/** Minimal string cache. Memory for tests/dev, Redis when REDIS_URL is set. */
export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export class MemoryCache implements Cache {
  private items = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.items.get(key);
    if (!item) return null;
    if (item.expiresAt < Date.now()) {
      this.items.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.items.size >= 1000) {
      const oldest = this.items.keys().next().value;
      if (oldest) this.items.delete(oldest);
    }
    this.items.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.items.delete(key);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }
}

export class RedisCache implements Cache {
  constructor(
    private redis: Redis,
    private prefix = process.env.CACHE_PREFIX ?? "mf:cache:",
  ) {}

  private k(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(this.k(key));
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.k(key), value, "EX", Math.max(ttlSeconds, 1));
  }

  async del(key: string): Promise<void> {
    await this.redis.del(this.k(key));
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }
}

let cached: Cache | null = null;

/** Redis when REDIS_URL is set (and driver isn't forced to memory), else process-local. */
export function getCache(): Cache {
  if (cached) return cached;
  if (process.env.CACHE_DRIVER === "memory") {
    cached = new MemoryCache();
  } else if (process.env.REDIS_URL) {
    cached = new RedisCache(new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true }));
  } else {
    cached = new MemoryCache();
  }
  return cached;
}

/** Test-only reset. */
export function __resetCacheForTests(): void {
  cached = null;
}
