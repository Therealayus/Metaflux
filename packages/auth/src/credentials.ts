import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const KEY_LEN = 32;

/** scrypt password hash: `scrypt$<salt-hex>$<hash-hex>`. */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  if (password.length > 256) throw new Error("Password too long");
  const salt = randomBytes(16);
  const hash = (await scrypt(password, salt, KEY_LEN)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const hash = (await scrypt(password, Buffer.from(saltHex, "hex"), KEY_LEN)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

/** Opaque session token (stored hashed server-side is unnecessary — sessions are random 256-bit). */
export function newSessionToken(): string {
  return `mfs_${randomBytes(32).toString("base64url")}`;
}

/** API key: `mf_live_<32 random chars>` / `mf_test_...`. Only the hash is stored. */
export function newApiKey(env: "live" | "test" = "live"): { raw: string; prefix: string } {
  const secret = randomBytes(24).toString("base64url");
  const prefix = secret.slice(0, 8);
  return { raw: `mf_${env}_${secret}`, prefix };
}

export function validateApiKeyFormat(raw: string): boolean {
  return /^mf_(live|test)_[A-Za-z0-9_-]{24,}$/.test(raw);
}
