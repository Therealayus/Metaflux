import { createHash, randomBytes } from "node:crypto";
import { hashPassword, newSessionToken, verifyPassword } from "@socialflux/auth";
import { getStore } from "@socialflux/database";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { SESSION_COOKIE, requestId, sendError } from "../tenant.js";

const SESSION_TTL_DAYS = 30;

function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 3600,
  });
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const signupBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
  name: z.string().min(1).max(120).optional(),
  organization: z.string().min(1).max(120).optional(),
});

const signinBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  organizationId: z.string().optional(),
});

export async function authRoutes(app: FastifyInstance) {
  const store = await getStore();

  app.post("/api/v1/auth/signup", async (request, reply) => {
    const reqId = requestId(request);
    const parsed = signupBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Valid email and password (8+ chars) required", reqId);
    try {
      const user = await store.createUser({
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
        name: parsed.data.name,
      });
      const org = await store.createOrganization({
        name: parsed.data.organization ?? `${parsed.data.name ?? "My"}'s organization`,
        slug: slugify(parsed.data.organization ?? parsed.data.email.split("@")[0] ?? "org"),
      });
      await store.createMembership(user.id, org.id, "owner");
      const workspace = await store.createWorkspace(org.id, "Production");
      const token = newSessionToken();
      await store.createSession(
        user.id,
        hashToken(token),
        new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000).toISOString(),
      );
      setSessionCookie(reply, token);
      await store.audit(org.id, user.id, "auth.signup", user.id);
      return reply.status(201).send({
        data: { user: { id: user.id, email: user.email, name: user.name }, organization: org, workspace },
        requestId: reqId,
      });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      return sendError(reply, status, "signup_failed", err instanceof Error ? err.message : "Signup failed", reqId);
    }
  });

  app.post("/api/v1/auth/signin", async (request, reply) => {
    const reqId = requestId(request);
    const parsed = signinBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Email and password required", reqId);
    const user = await store.getUserByEmail(parsed.data.email);
    if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      // Uniform response: no user enumeration, constant-time-ish path.
      return sendError(reply, 401, "invalid_credentials", "Invalid email or password", reqId);
    }
    const memberships = await store.listUserMemberships(user.id);
    if (memberships.length === 0) return sendError(reply, 403, "no_organization", "Account has no organization", reqId);
    const membership =
      (parsed.data.organizationId && memberships.find((m) => m.organizationId === parsed.data.organizationId)) ??
      memberships[0];
    if (!membership) return sendError(reply, 403, "no_access", "No access to that organization", reqId);
    const token = newSessionToken();
    await store.createSession(
      user.id,
      hashToken(token),
      new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000).toISOString(),
    );
    setSessionCookie(reply, token);
    return reply.send({
      data: {
        user: { id: user.id, email: user.email, name: user.name },
        organization: membership.organization,
        role: membership.role,
      },
      requestId: reqId,
    });
  });

  app.post("/api/v1/auth/signout", async (request, reply) => {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[SESSION_COOKIE];
    if (token) {
      const sess = await store.getSessionByTokenHash(hashToken(token));
      if (sess) await store.deleteSession(sess.id);
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.send({ data: { signedOut: true }, requestId: requestId(request) });
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    const reqId = requestId(request);
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[SESSION_COOKIE];
    if (!token) return sendError(reply, 401, "unauthorized", "Not signed in", reqId);
    const sess = await store.getSessionByTokenHash(hashToken(token));
    if (!sess) return sendError(reply, 401, "unauthorized", "Session expired", reqId);
    const memberships = await store.listUserMemberships(sess.user.id);
    return reply.send({
      data: {
        user: { id: sess.user.id, email: sess.user.email, name: sess.user.name },
        organizations: memberships.map((m) => ({ ...m.organization, role: m.role })),
      },
      requestId: reqId,
    });
  });

  // --- Password reset (token flow; email delivery is the deployer's integration) ---
  const resetRequestBody = z.object({ email: z.string().email().max(254) });
  const resetRedeemBody = z.object({ token: z.string().min(10).max(256), password: z.string().min(8).max(256) });

  app.post("/api/v1/auth/password-reset/request", async (request, reply) => {
    const reqId = requestId(request);
    const parsed = resetRequestBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Valid email required", reqId);
    // Uniform 200 regardless of existence — no account enumeration.
    const user = await store.getUserByEmail(parsed.data.email);
    if (user) {
      const token = `mfr_${randomBytes(32).toString("base64url")}`;
      await store.createPasswordReset(
        user.id,
        hashToken(token),
        new Date(Date.now() + 3600_000).toISOString(),
      );
      // Email delivery plugs in here. In non-production the token is returned
      // so local development and tests can complete the flow.
      if (process.env.NODE_ENV !== "production") {
        return reply.send({ data: { requested: true, devToken: token }, requestId: reqId });
      }
      request.log.info({ requestId: reqId, msg: "password reset requested (email integration sends the token)" });
    }
    return reply.send({ data: { requested: true }, requestId: reqId });
  });

  app.post("/api/v1/auth/password-reset/redeem", async (request, reply) => {
    const reqId = requestId(request);
    const parsed = resetRedeemBody.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "invalid_request", "Token and new password required", reqId);
    const userId = await store.consumePasswordReset(hashToken(parsed.data.token));
    if (!userId) return sendError(reply, 400, "invalid_token", "Reset link is invalid or expired", reqId);
    await store.updateUserPassword(userId, await hashPassword(parsed.data.password));
    return reply.send({ data: { reset: true }, requestId: reqId });
  });

  // --- Google OAuth (real flow when GOOGLE_CLIENT_ID/SECRET are configured) ---
  app.get("/api/v1/auth/google/start", async (request, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URL;
    if (!clientId || !redirectUri) {
      return sendError(reply, 501, "oauth_not_configured", "Google sign-in is not configured on this instance", requestId(request));
    }
    const state = randomBytes(16).toString("hex");
    const qs = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
    });
    return reply.send({ data: { url: `https://accounts.google.com/o/oauth2/v2/auth?${qs}`, state }, requestId: requestId(request) });
  });

  app.get("/api/v1/auth/google/callback", async (request, reply) => {
    const reqId = requestId(request);
    const q = request.query as { code?: string };
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URL;
    if (!clientId || !clientSecret || !redirectUri || !q.code) {
      return sendError(reply, 501, "oauth_not_configured", "Google sign-in is not configured", reqId);
    }
    try {
      const tokRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: q.code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      });
      const tok = (await tokRes.json()) as { access_token?: string; error_description?: string };
      if (!tok.access_token) throw new Error(tok.error_description ?? "Google token exchange failed");
      const meRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      const profile = (await meRes.json()) as { email?: string; name?: string; email_verified?: boolean };
      if (!profile.email) throw new Error("Google did not return an email");
      const result = await upsertOAuthUser(store, profile.email, profile.name);
      const token = newSessionToken();
      await store.createSession(userIdOf(result), hashToken(token), new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000).toISOString());
      setSessionCookie(reply, token);
      return reply.redirect(`${process.env.WEB_URL ?? "http://localhost:3000"}/home`);
    } catch (err) {
      return sendError(reply, 502, "oauth_failed", err instanceof Error ? err.message : "Google sign-in failed", reqId);
    }
  });

  // --- GitHub OAuth (real flow when GITHUB_CLIENT_ID/SECRET are configured) ---
  app.get("/api/v1/auth/github/start", async (request, reply) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const redirectUri = process.env.GITHUB_OAUTH_REDIRECT_URL;
    if (!clientId || !redirectUri) {
      return sendError(reply, 501, "oauth_not_configured", "GitHub sign-in is not configured on this instance", requestId(request));
    }
    const state = randomBytes(16).toString("hex");
    const qs = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: "user:email", state });
    return reply.send({ data: { url: `https://github.com/login/oauth/authorize?${qs}`, state }, requestId: requestId(request) });
  });

  app.get("/api/v1/auth/github/callback", async (request, reply) => {
    const reqId = requestId(request);
    const q = request.query as { code?: string };
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    const redirectUri = process.env.GITHUB_OAUTH_REDIRECT_URL;
    if (!clientId || !clientSecret || !redirectUri || !q.code) {
      return sendError(reply, 501, "oauth_not_configured", "GitHub sign-in is not configured", reqId);
    }
    try {
      const tokRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: q.code, redirect_uri: redirectUri }),
      });
      const tok = (await tokRes.json()) as { access_token?: string; error_description?: string };
      if (!tok.access_token) throw new Error(tok.error_description ?? "GitHub token exchange failed");
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/vnd.github+json" },
      });
      const emails = (await emailsRes.json()) as Array<{ email?: string; primary?: boolean; verified?: boolean }>;
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified) ?? emails[0];
      if (!primary?.email) throw new Error("GitHub did not return a verified email");
      const result = await upsertOAuthUser(store, primary.email, undefined);
      const token = newSessionToken();
      await store.createSession(userIdOf(result), hashToken(token), new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000).toISOString());
      setSessionCookie(reply, token);
      return reply.redirect(`${process.env.WEB_URL ?? "http://localhost:3000"}/home`);
    } catch (err) {
      return sendError(reply, 502, "oauth_failed", err instanceof Error ? err.message : "GitHub sign-in failed", reqId);
    }
  });
}

type StoreType = Awaited<ReturnType<typeof getStore>>;

async function upsertOAuthUser(store: StoreType, email: string, name: string | undefined) {
  const existing = await store.getUserByEmail(email);
  if (existing) return { user: existing, created: false };
  const user = await store.createUser({ email, name });
  const org = await store.createOrganization({ name: `${name ?? email.split("@")[0]}'s organization`, slug: slugify(email.split("@")[0] ?? "org") });
  await store.createMembership(user.id, org.id, "owner");
  await store.createWorkspace(org.id, "Production");
  return { user, created: true };
}

function userIdOf(result: { user: { id: string } }): string {
  return result.user.id;
}
