/**
 * POST /api/auth/login — break-glass restriction.
 *
 * Once Microsoft SSO is the front door, password sign-in exists only so an
 * Entra or tenant outage can't lock administrators out. These tests pin that
 * boundary: a system account with a password still gets in; an ordinary
 * employee-linked account never does, even with the correct password.
 *
 * Every rejection must be the same generic 401 — the response must not let a
 * caller distinguish "wrong password" from "this account can't use passwords".
 */
import express from "express";
import supertest from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db, usersTable, passwordResetTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/password";
import authRouter from "../routes/auth";
import { cleanupUser, safeCleanup } from "./helpers";

const PASSWORD = "CorrectHorse123!";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // The login route only ever writes req.session.userId.
    // @ts-expect-error — fake session for tests only
    req.session = {};
    next();
  });
  app.use("/api", authRouter);
  return supertest(app);
}

const api = buildApp();

interface Fixture {
  id: number;
  email: string;
}

async function createUser(opts: {
  isSystemAccount: boolean;
  withPassword: boolean;
  status?: string;
}): Promise<Fixture> {
  const email = `breakglass-${randomUUID()}@example-test.invalid`;
  const [user] = await db
    .insert(usersTable)
    .values({
      name: "Break Glass Test",
      email,
      passwordHash: opts.withPassword ? hashPassword(PASSWORD) : null,
      isSystemAccount: opts.isSystemAccount,
      status: opts.status ?? "active",
      permissions: [],
    })
    .returning({ id: usersTable.id });
  return { id: user.id, email };
}

let systemUser: Fixture;
let normalUser: Fixture;
let passwordlessSystemUser: Fixture;

beforeAll(async () => {
  systemUser = await createUser({ isSystemAccount: true, withPassword: true });
  normalUser = await createUser({ isSystemAccount: false, withPassword: true });
  passwordlessSystemUser = await createUser({
    isSystemAccount: true,
    withPassword: false,
  });
});

afterAll(async () => {
  for (const u of [systemUser, normalUser, passwordlessSystemUser]) {
    await safeCleanup(() => cleanupUser(u.id));
  }
});

describe("POST /api/auth/login", () => {
  it("lets a system account in with the correct password", async () => {
    const res = await api
      .post("/api/auth/login")
      .send({ email: systemUser.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(systemUser.email);
  });

  it("refuses a non-system account even with the correct password", async () => {
    const res = await api
      .post("/api/auth/login")
      .send({ email: normalUser.email, password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("refuses a system account that has no password set", async () => {
    const res = await api
      .post("/api/auth/login")
      .send({ email: passwordlessSystemUser.email, password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("gives an identical response for a wrong password and an SSO-only account", async () => {
    const wrongPassword = await api
      .post("/api/auth/login")
      .send({ email: systemUser.email, password: "not-the-password" });
    const ssoOnly = await api
      .post("/api/auth/login")
      .send({ email: normalUser.email, password: PASSWORD });

    expect(wrongPassword.status).toBe(ssoOnly.status);
    expect(wrongPassword.body).toEqual(ssoOnly.body);
  });
});

describe("POST /api/auth/forgot-password", () => {
  it("issues a reset token for a system account", async () => {
    const res = await api
      .post("/api/auth/forgot-password")
      .send({ email: systemUser.email });

    expect(res.status).toBe(200);
    const tokens = await db
      .select({ id: passwordResetTokensTable.id })
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.userId, systemUser.id));
    expect(tokens.length).toBe(1);
  });

  it("issues no token for an SSO-only account but answers identically", async () => {
    const res = await api
      .post("/api/auth/forgot-password")
      .send({ email: normalUser.email });

    // Same body as the system-account case — no email enumeration.
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(
      "If that email is registered, a reset link has been sent.",
    );

    const tokens = await db
      .select({ id: passwordResetTokensTable.id })
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.userId, normalUser.id));
    expect(tokens.length).toBe(0);
  });
});
