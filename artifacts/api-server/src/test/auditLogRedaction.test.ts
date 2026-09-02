/**
 * Audit trail — query-parameter redaction.
 *
 * The audit middleware records query params in the action detail so filters
 * are visible in SysAdmin → Audit Trail. Not every query string is a filter:
 * the Microsoft SSO callback arrives as `?code=…&state=…`, and an
 * authorization code written to `audit_log` in plaintext would be a
 * credential sitting in a table many people can read.
 */
import express from "express";
import supertest from "supertest";
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { db, auditLogTable } from "@workspace/db";
import { auditLogMiddleware } from "../middlewares/auditLog";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // @ts-expect-error — fake session for tests only
    req.session = {};
    next();
  });
  app.use("/api", auditLogMiddleware);
  app.get("/api/:probe", (_req, res) => {
    res.json({ ok: true });
  });
  return supertest(app);
}

const api = buildApp();

/** Audit writes are fire-and-forget, so poll briefly for the row. */
async function waitForEntry(path: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const [row] = await db
      .select({ action: auditLogTable.action })
      .from(auditLogTable)
      .where(and(eq(auditLogTable.path, path), like(auditLogTable.action, "%")))
      .limit(1);
    if (row) return row.action;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`no audit row recorded for ${path}`);
}

const probes: string[] = [];

afterAll(async () => {
  for (const p of probes) {
    await db.delete(auditLogTable).where(eq(auditLogTable.path, p));
  }
});

describe("audit trail query redaction", () => {
  it("redacts an OAuth authorization code and state", async () => {
    const probe = `probe-${randomUUID()}`;
    probes.push(`/api/${probe}`);

    await api.get(`/api/${probe}?code=super-secret-auth-code&state=abc123`);
    const action = await waitForEntry(`/api/${probe}`);

    expect(action).not.toContain("super-secret-auth-code");
    expect(action).not.toContain("abc123");
    expect(action).toContain("[REDACTED]");
  });

  it("redacts tokens passed as query params", async () => {
    const probe = `probe-${randomUUID()}`;
    probes.push(`/api/${probe}`);

    await api.get(`/api/${probe}?id_token=header.payload.signature`);
    const action = await waitForEntry(`/api/${probe}`);

    expect(action).not.toContain("header.payload.signature");
    expect(action).toContain("[REDACTED]");
  });

  it("still records ordinary filters in full", async () => {
    const probe = `probe-${randomUUID()}`;
    probes.push(`/api/${probe}`);

    await api.get(`/api/${probe}?status=active&search=thompson`);
    const action = await waitForEntry(`/api/${probe}`);

    expect(action).toContain("active");
    expect(action).toContain("thompson");
  });
});
