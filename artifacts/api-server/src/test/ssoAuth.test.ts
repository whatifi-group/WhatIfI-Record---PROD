/**
 * /api/auth/sso/* — route-level tests.
 *
 * The Entra client is mocked so nothing here touches the network: these tests
 * are about the handshake RECORD is responsible for — carrying PKCE state
 * across the redirect, rejecting a callback that doesn't match it, pinning the
 * tenant, and regenerating the session so a pre-login session id can't be
 * promoted to an authenticated one.
 */
import express from "express";
import session from "express-session";
import supertest from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { cleanupUser, safeCleanup } from "./helpers";

const TENANT = "test-tenant-id";
const REDIRECT = "https://record.example-test.invalid/api/auth/sso/callback";

// ── Entra mock ────────────────────────────────────────────────────────────────

const mockBuildAuthRequest = vi.fn();
const mockExchangeCode = vi.fn();
const mockSsoEnabled = vi.fn(() => true);

vi.mock("../lib/entra", () => ({
  ssoEnabled: () => mockSsoEnabled(),
  buildAuthRequest: (prompt?: string) => mockBuildAuthRequest(prompt),
  exchangeCode: (url: URL, checks: unknown) => mockExchangeCode(url, checks),
  redirectUri: () => REDIRECT,
}));

const { default: authRouter } = await import("../routes/auth");
const { requireAuth } = await import("../middlewares/requireAuth");

// ── App ───────────────────────────────────────────────────────────────────────

/** Mirrors app.ts wiring, but with an in-memory session store. */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }),
  );
  app.use("/api", requireAuth);
  app.use("/api", authRouter);
  return app;
}

const api = supertest(buildApp());

/** Pull the connect.sid value out of a set-cookie header. */
function sessionId(res: { headers: Record<string, unknown> }): string | null {
  const raw = res.headers["set-cookie"] as string[] | undefined;
  if (!raw) return null;
  const cookie = raw.find((c) => c.startsWith("connect.sid="));
  return cookie ? cookie.split(";")[0].split("=")[1] : null;
}

let userId: number;
let userEmail: string;
let userOid: string;

beforeAll(async () => {
  userEmail = `sso-route-${randomUUID()}@example-test.invalid`;
  userOid = `oid-${randomUUID()}`;
  const [user] = await db
    .insert(usersTable)
    .values({
      name: "SSO Route User",
      email: userEmail,
      msEntraObjectId: userOid,
      permissions: [],
    })
    .returning({ id: usersTable.id });
  userId = user.id;
});

afterAll(async () => {
  await safeCleanup(() => cleanupUser(userId));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSsoEnabled.mockReturnValue(true);
  process.env.AZURE_TENANT_ID = TENANT;
  process.env.APP_URL = "https://record.example-test.invalid";
  mockBuildAuthRequest.mockResolvedValue({
    url: "https://login.microsoftonline.com/authorize?client_id=x",
    codeVerifier: "verifier-123",
    state: "state-123",
    nonce: "nonce-123",
  });
  mockExchangeCode.mockResolvedValue({
    objectId: userOid,
    tenantId: TENANT,
    email: userEmail,
    name: "SSO Route User",
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("the SSO routes are reachable without a session", () => {
  it("GET /api/auth/sso/login is not blocked by requireAuth", async () => {
    const res = await api.get("/api/auth/sso/login");
    expect(res.status).not.toBe(401);
  });

  it("GET /api/auth/sso/callback is not blocked by requireAuth", async () => {
    const res = await api.get("/api/auth/sso/callback");
    expect(res.status).not.toBe(401);
  });
});

describe("GET /api/auth/sso/login", () => {
  it("redirects to Microsoft and persists the handshake", async () => {
    const res = await api.get("/api/auth/sso/login");

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("login.microsoftonline.com");
    // The PKCE values must survive the redirect, so a session cookie is set.
    expect(sessionId(res)).toBeTruthy();
  });

  it("sends no prompt by default, so an existing session signs in silently", async () => {
    await api.get("/api/auth/sso/login");
    expect(mockBuildAuthRequest).toHaveBeenCalledWith(undefined);
  });

  it("forwards prompt=select_account for 'use a different account'", async () => {
    await api.get("/api/auth/sso/login?prompt=select_account");
    expect(mockBuildAuthRequest).toHaveBeenCalledWith("select_account");
  });

  it("ignores an arbitrary prompt value", async () => {
    await api.get("/api/auth/sso/login?prompt=login%20consent");
    expect(mockBuildAuthRequest).toHaveBeenCalledWith(undefined);
  });

  it("returns 503 when SSO is not configured", async () => {
    mockSsoEnabled.mockReturnValue(false);
    const res = await api.get("/api/auth/sso/login");
    expect(res.status).toBe(503);
  });
});

describe("GET /api/auth/sso/callback", () => {
  /** Drive a full login → callback round trip, carrying the session cookie. */
  async function roundTrip(callbackQuery: string) {
    const agent = supertest.agent(buildApp());
    await agent.get("/api/auth/sso/login");
    return agent.get(`/api/auth/sso/callback${callbackQuery}`);
  }

  it("signs the user in and redirects to the app", async () => {
    const res = await roundTrip("?code=abc&state=state-123");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://record.example-test.invalid/");
    expect(mockExchangeCode).toHaveBeenCalledWith(expect.any(URL), {
      codeVerifier: "verifier-123",
      state: "state-123",
      nonce: "nonce-123",
    });
  });

  it("stamps lastLoginAt", async () => {
    await db
      .update(usersTable)
      .set({ lastLoginAt: null })
      .where(eq(usersTable.id, userId));

    await roundTrip("?code=abc&state=state-123");

    const [row] = await db
      .select({ lastLoginAt: usersTable.lastLoginAt })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    expect(row.lastLoginAt).not.toBeNull();
  });

  it("issues a different session id than the pre-login one", async () => {
    const agent = supertest.agent(buildApp());
    const login = await agent.get("/api/auth/sso/login");
    const preLogin = sessionId(login);

    const callback = await agent.get("/api/auth/sso/callback?code=abc&state=state-123");
    const postLogin = sessionId(callback);

    expect(preLogin).toBeTruthy();
    expect(postLogin).toBeTruthy();
    expect(postLogin).not.toBe(preLogin);
  });

  it("rejects a callback with no handshake in the session", async () => {
    const res = await api.get("/api/auth/sso/callback?code=abc&state=state-123");

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/login?error=sso_failed");
    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it("refuses to replay a handshake a second time", async () => {
    const agent = supertest.agent(buildApp());
    await agent.get("/api/auth/sso/login");
    await agent.get("/api/auth/sso/callback?code=abc&state=state-123");

    const replay = await agent.get("/api/auth/sso/callback?code=abc&state=state-123");
    expect(replay.headers.location).toContain("/login?error=sso_failed");
  });

  it("redirects with sso_failed when the code exchange throws", async () => {
    // Covers a bad code and a state/nonce mismatch alike — openid-client
    // raises for all of them.
    mockExchangeCode.mockRejectedValue(new Error("state mismatch"));

    const res = await roundTrip("?code=abc&state=wrong-state");
    expect(res.headers.location).toContain("/login?error=sso_failed");
  });

  it("redirects with sso_failed when the provider returns an error", async () => {
    const res = await roundTrip("?error=access_denied");

    expect(res.headers.location).toContain("/login?error=sso_failed");
    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it("refuses a token from another tenant", async () => {
    mockExchangeCode.mockResolvedValue({
      objectId: userOid,
      tenantId: "some-other-tenant",
      email: userEmail,
      name: "Intruder",
    });

    const res = await roundTrip("?code=abc&state=state-123");
    expect(res.headers.location).toContain("/login?error=wrong_tenant");
  });

  it("surfaces the resolution failure reason", async () => {
    mockExchangeCode.mockResolvedValue({
      objectId: `oid-${randomUUID()}`,
      tenantId: TENANT,
      email: `nobody-${randomUUID()}@example-test.invalid`,
      name: "Nobody",
    });

    const res = await roundTrip("?code=abc&state=state-123");
    expect(res.headers.location).toContain("/login?error=no_account");
  });

  it("returns 503 when SSO is not configured", async () => {
    mockSsoEnabled.mockReturnValue(false);
    const res = await api.get("/api/auth/sso/callback?code=abc");
    expect(res.status).toBe(503);
  });
});
