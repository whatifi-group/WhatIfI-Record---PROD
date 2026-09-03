import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";
import { db, employeesTable, rolesTable, usersTable, userRolesTable, passwordResetTokensTable } from "@workspace/db";
import { verifyPassword, hashPassword } from "../lib/password";
import { LoginBody } from "@workspace/api-zod";
import { sendPasswordResetEmail } from "../lib/email";
import { ssoEnabled, buildAuthRequest, exchangeCode, redirectUri } from "../lib/entra";
import { resolveSsoUser } from "../lib/ssoUser";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function appUrl(): string {
  return (
    process.env.APP_URL?.replace(/\/$/, "") ?? "https://record.whatifigroup.co.uk"
  );
}

function userRow(row: {
  id: number;
  name: string;
  email: string;
  status: string;
  roles: { id: number; name: string }[];
  rolePermissions: unknown[];
  userPermissions: unknown;
  isSystemAccount: boolean;
  employeeId: number | null;
  employee: { id: number; firstName: string; lastName: string; status: string } | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}) {
  const userPerms = Array.isArray(row.userPermissions) ? row.userPermissions : [];
  const effectivePermissions = [...new Set([...row.rolePermissions, ...userPerms])];

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    status: row.status,
    roles: row.roles,
    permissions: effectivePermissions,
    isSystemAccount: row.isSystemAccount,
    employeeId: row.employeeId,
    employee: row.employee,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}

async function fetchUser(id: number) {
  const [row] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      status: usersTable.status,
      userPermissions: usersTable.permissions,
      isSystemAccount: usersTable.isSystemAccount,
      employeeId: usersTable.employeeId,
      employeeRecordId: employeesTable.id,
      employeeFirstName: employeesTable.firstName,
      employeeLastName: employeesTable.lastName,
      employeeStatus: employeesTable.status,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .leftJoin(employeesTable, eq(usersTable.employeeId, employeesTable.id))
    .where(eq(usersTable.id, id));

  if (!row) return null;

  const roleRows = await db
    .select({ id: rolesTable.id, name: rolesTable.name, permissions: rolesTable.permissions })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(userRolesTable.userId, id));

  return {
    ...row,
    roles: roleRows.map((r) => ({ id: r.id, name: r.name })),
    rolePermissions: roleRows.flatMap((r) => (Array.isArray(r.permissions) ? r.permissions : [])),
    employee:
      row.employeeRecordId != null
        ? {
            id: row.employeeRecordId,
            firstName: row.employeeFirstName!,
            lastName: row.employeeLastName!,
            status: row.employeeStatus!,
          }
        : null,
  };
}

// POST /api/auth/login
//
// Break-glass only. Normal users authenticate through Microsoft SSO; this path
// exists so a tenant or Entra outage can't lock administrators out of RECORD.
// Only system accounts that actually hold a password may use it.
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, parsed.data.email.toLowerCase()))
    .limit(1);

  // One indistinguishable rejection for "no such user", "wrong password",
  // "SSO-only account" and "no password set" — the response must not reveal
  // which accounts can sign in this way.
  if (
    !user ||
    !user.isSystemAccount ||
    !user.passwordHash ||
    !verifyPassword(parsed.data.password, user.passwordHash)
  ) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (user.status !== "active") {
    res.status(401).json({ error: "Account is not active" });
    return;
  }

  // Update last login timestamp
  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  req.session.userId = user.id;

  const row = await fetchUser(user.id);
  res.json(userRow(row!));
});

// ── Microsoft Entra ID SSO ───────────────────────────────────────────────────
//
// These two endpoints are browser redirects, not JSON APIs, so they are
// deliberately absent from the OpenAPI spec — the SPA navigates to
// /auth/sso/login with window.location rather than fetching it.

/** Persist the session before redirecting, so the store write can't race. */
function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

/** Send the browser back to the login screen with a machine-readable reason. */
function failToLogin(res: Response, code: string): void {
  res.redirect(`${appUrl()}/login?error=${encodeURIComponent(code)}`);
}

// GET /api/auth/sso/login
router.get("/auth/sso/login", async (req, res): Promise<void> => {
  if (!ssoEnabled()) {
    res.status(503).json({ error: "Microsoft sign-in is not configured" });
    return;
  }

  try {
    // No `prompt` by default — that is what makes this single sign-on: a user
    // with a live Microsoft session returns without seeing a sign-in screen.
    // "select_account" is offered for the explicit "use a different account".
    const prompt =
      req.query.prompt === "select_account" ? "select_account" : undefined;

    const auth = await buildAuthRequest(prompt);

    req.session.sso = {
      codeVerifier: auth.codeVerifier,
      state: auth.state,
      nonce: auth.nonce,
    };
    await saveSession(req);

    res.redirect(auth.url);
  } catch (err) {
    logger.error({ err }, "SSO: failed to build authorization request");
    failToLogin(res, "sso_failed");
  }
});

// GET /api/auth/sso/callback
router.get("/auth/sso/callback", async (req, res): Promise<void> => {
  if (!ssoEnabled()) {
    res.status(503).json({ error: "Microsoft sign-in is not configured" });
    return;
  }

  const pending = req.session.sso;
  // Single-use: clear the handshake immediately so a replayed callback can't
  // be validated against it a second time.
  delete req.session.sso;

  if (!pending) {
    logger.warn("SSO: callback with no pending handshake in session");
    failToLogin(res, "sso_failed");
    return;
  }

  // Entra reports user-facing problems (consent declined, account disabled)
  // as query params rather than a failed exchange.
  if (typeof req.query.error === "string") {
    logger.warn({ error: req.query.error }, "SSO: provider returned an error");
    failToLogin(res, "sso_failed");
    return;
  }

  let claims;
  try {
    // Rebuild the callback URL from the registered redirect URI rather than
    // the inbound Host header, which is attacker-influenced behind a proxy.
    const currentUrl = new URL(redirectUri());
    currentUrl.search = new URL(
      req.originalUrl,
      "http://placeholder.invalid",
    ).search;

    claims = await exchangeCode(currentUrl, {
      codeVerifier: pending.codeVerifier,
      state: pending.state,
      nonce: pending.nonce,
    });
  } catch (err) {
    // Covers a bad/replayed code, a state or nonce mismatch, and any ID token
    // that fails signature, issuer or audience validation.
    logger.warn({ err }, "SSO: authorization code exchange failed");
    failToLogin(res, "sso_failed");
    return;
  }

  // Defence in depth: the tenant-specific authority already pins the issuer,
  // but assert the tenant explicitly too.
  if (claims.tenantId !== process.env.AZURE_TENANT_ID) {
    logger.warn({ tid: claims.tenantId }, "SSO: token from an unexpected tenant");
    failToLogin(res, "wrong_tenant");
    return;
  }

  const resolution = await resolveSsoUser(claims);
  if (!resolution.ok) {
    failToLogin(res, resolution.reason);
    return;
  }

  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, resolution.userId));

  // Regenerate before storing the identity so a session id an attacker may
  // have planted pre-login cannot become an authenticated one.
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  req.session.userId = resolution.userId;
  await saveSession(req);

  res.redirect(`${appUrl()}/`);
});

// POST /api/auth/logout
//
// Local sign-out only. We deliberately do not hit Entra's end_session_endpoint:
// that would sign the user out of Outlook and every other Microsoft app in the
// browser, which is not what "log out of RECORD" should mean. The login page
// offers "use a different account" for the case where that is actually wanted.
router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.sendStatus(204);
  });
});

// GET /api/auth/me
router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const row = await fetchUser(req.session.userId);
  if (!row) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "User no longer exists" });
    return;
  }

  if (row.status !== "active") {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Account is not active" });
    return;
  }

  res.json(userRow(row));
});

// POST /api/auth/forgot-password
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      status: usersTable.status,
      isSystemAccount: usersTable.isSystemAccount,
    })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()))
    .limit(1);

  // Always respond the same way to prevent email enumeration.
  // Passwords only exist for break-glass system accounts, so there is nothing
  // to reset for anyone else — they sign in through Microsoft.
  if (!user || user.status !== "active" || !user.isSystemAccount) {
    res.json({ message: "If that email is registered, a reset link has been sent." });
    return;
  }

  // Invalidate any existing unused tokens for this user
  await db
    .delete(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.userId, user.id));

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokensTable).values({
    userId: user.id,
    token,
    expiresAt,
  });

  const appUrl =
    process.env.APP_URL?.replace(/\/$/, "") ??
    "https://record.whatifigroup.co.uk";
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  await sendPasswordResetEmail(user.email, user.name, resetUrl);

  res.json({ message: "If that email is registered, a reset link has been sent." });
});

// POST /api/auth/reset-password
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body ?? {};
  if (!token || typeof token !== "string" || !password || typeof password !== "string") {
    res.status(400).json({ error: "Token and password are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const now = new Date();
  const [row] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.token, token),
        gt(passwordResetTokensTable.expiresAt, now),
      ),
    )
    .limit(1);

  if (!row || row.usedAt) {
    res.status(400).json({ error: "Reset link is invalid or has expired." });
    return;
  }

  // Mark token as used
  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: now })
    .where(eq(passwordResetTokensTable.id, row.id));

  // Update password
  await db
    .update(usersTable)
    .set({ passwordHash: hashPassword(password), updatedAt: now })
    .where(eq(usersTable.id, row.userId));

  res.json({ message: "Password has been reset successfully." });
});

export default router;
