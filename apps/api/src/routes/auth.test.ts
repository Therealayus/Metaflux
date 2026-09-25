import { beforeEach, describe, expect, it } from "vitest";
import { __resetQueueDriverForTests } from "@socialflux/queues";
import { __resetStoreForTests } from "@socialflux/database";
import { buildServer } from "../server.js";

beforeEach(() => {
  process.env.STORE_DRIVER = "memory";
  process.env.QUEUE_DRIVER = "memory";
  process.env.AUTH_SECRET = "a".repeat(32);
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_ID;
  __resetStoreForTests();
  __resetQueueDriverForTests();
});

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers["set-cookie"] as string | string[] | undefined;
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!first) throw new Error("no set-cookie header");
  return first.split(";")[0] as string;
}

describe("password auth", () => {
  it("signs up, signs in, resolves tenant sessions, and signs out", async () => {
    const app = buildServer();
    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email: "ada@example.com", password: "correct-horse-1", name: "Ada", organization: "Adacorp" },
    });
    expect(signup.statusCode).toBe(201);
    const orgId = signup.json().data.organization.id as string;
    const cookie = cookieFrom(signup);

    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.organizations).toHaveLength(1);

    // Session tenant reaches tenant-scoped APIs with the membership role.
    const conns = await app.inject({ method: "GET", url: "/api/v1/connections", headers: { cookie, "x-org-id": orgId } });
    expect(conns.statusCode).toBe(200);

    // Wrong org is rejected.
    const foreign = await app.inject({ method: "GET", url: "/api/v1/connections", headers: { cookie, "x-org-id": "org_nope" } });
    expect(foreign.statusCode).toBe(401);

    const out = await app.inject({ method: "POST", url: "/api/v1/auth/signout", headers: { cookie } });
    expect(out.json().data.signedOut).toBe(true);
    const meAfter = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie } });
    expect(meAfter.statusCode).toBe(401);
  });

  it("rejects duplicates and bad credentials without user enumeration", async () => {
    const app = buildServer();
    const body = { email: "bob@example.com", password: "correct-horse-1" };
    expect((await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: body })).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: body })).statusCode).toBe(409);
    const bad = await app.inject({ method: "POST", url: "/api/v1/auth/signin", payload: { email: "bob@example.com", password: "nope-nope-1" } });
    expect(bad.statusCode).toBe(401);
    const missing = await app.inject({ method: "POST", url: "/api/v1/auth/signin", payload: { email: "ghost@example.com", password: "nope-nope-1" } });
    expect(missing.statusCode).toBe(401);
    const ok = await app.inject({ method: "POST", url: "/api/v1/auth/signin", payload: body });
    expect(ok.statusCode).toBe(200);
  });

  it("completes password reset with single-use tokens", async () => {
    const app = buildServer();
    await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: { email: "cat@example.com", password: "old-password-1" } });
    const req = await app.inject({ method: "POST", url: "/api/v1/auth/password-reset/request", payload: { email: "cat@example.com" } });
    expect(req.statusCode).toBe(200);
    const token = req.json().data.devToken as string;
    expect(typeof token).toBe("string");
    // Unknown emails get the same shape (no enumeration).
    const ghost = await app.inject({ method: "POST", url: "/api/v1/auth/password-reset/request", payload: { email: "ghost@example.com" } });
    expect(ghost.json().data.requested).toBe(true);
    expect(ghost.json().data.devToken).toBeUndefined();

    const redeem = await app.inject({ method: "POST", url: "/api/v1/auth/password-reset/redeem", payload: { token, password: "new-password-1" } });
    expect(redeem.statusCode).toBe(200);
    const reuse = await app.inject({ method: "POST", url: "/api/v1/auth/password-reset/redeem", payload: { token, password: "other-password-1" } });
    expect(reuse.statusCode).toBe(400);
    const signin = await app.inject({ method: "POST", url: "/api/v1/auth/signin", payload: { email: "cat@example.com", password: "new-password-1" } });
    expect(signin.statusCode).toBe(200);
  });

  it("reports unconfigured OAuth providers honestly", async () => {
    const app = buildServer();
    expect((await app.inject({ method: "GET", url: "/api/v1/auth/google/start" })).statusCode).toBe(501);
    expect((await app.inject({ method: "GET", url: "/api/v1/auth/github/start" })).statusCode).toBe(501);
  });
});
