import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertSafeHttpUrl, decryptToken, encryptToken, hashApiKey } from "./index.js";

describe("security", () => {
  it("round-trips token encryption", () => {
    const key = randomBytes(32).toString("base64");
    const enc = encryptToken("secret-token", key);
    expect(enc).not.toContain("secret-token");
    expect(decryptToken(enc, key)).toBe("secret-token");
  });

  it("hashes api keys deterministically", () => {
    expect(hashApiKey("k", "p")).toBe(hashApiKey("k", "p"));
  });

  it("blocks SSRF targets", () => {
    expect(() => assertSafeHttpUrl("https://example.com/hook")).not.toThrow();
    expect(() => assertSafeHttpUrl("http://169.254.169.254/")).toThrow();
  });
});
