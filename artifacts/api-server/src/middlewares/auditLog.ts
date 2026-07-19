import type { Request, Response, NextFunction } from "express";
import { db, auditLogTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LRUCache } from "lru-cache";
import { logger } from "../lib/logger";

// Short-lived cache so we don't run an extra SELECT for every single request
// just to resolve the acting user's display name. Mirrors the pattern (and
// TTL) used by the permissions cache in requirePermission.ts.
const userNameCache = new LRUCache<number, { name: string | null }>({
  max: 1_000,
  ttl: 60_000,
});

// ---------------------------------------------------------------------------
// System audit trail
// ---------------------------------------------------------------------------
// Records every request handled by the API (see replit.md's SysAdmin section
// for the rationale). Two pieces make this work with zero ongoing effort as
// new modules are added:
//
//  1. `tagAuditModule(name)` — a one-line middleware each module mount in
//     routes/index.ts is wrapped with, e.g.
//       router.use(tagAuditModule("hr"), hrRouter)
//     Adding a new module already means adding a mount line there, so
//     tagging it costs nothing extra and this file never needs to change.
//
//  2. `auditLogMiddleware` — mounted once, globally. It waits for the
//     response to finish, then derives a detailed action from the HTTP
//     method, path (including the specific record id), query filters,
//     request body, and — for successful creates/updates — the resulting
//     record returned by the route, e.g. PATCH /sysadmin/roles/12
//     {"permissions":[...]} -> `Updated role 12 (data: {"permissions":
//     [...]}; result: {"id":12,"name":"Manager",...})`. This is what "what
//     was committed" means here: automatic for every route (present and
//     future) with no per-route wiring, at the cost of showing full
//     before/after state rather than a minimal field-level diff.
//     Credential-like fields are redacted; the action string is capped at
//     5000 characters. If a route wasn't explicitly tagged (a module added
//     without using the helper above), it falls back to the first path
//     segment as the module name, so nothing is ever silently dropped.
//
//  3. `recordViewDuration` — called by POST /audit-log/view-duration (see
//     routes/auditLog.ts), which the frontend hits via `sendBeacon` when a
//     record detail page (Employee Profile, LOV category detail, an
//     onboarding submission dialog, ...) is closed. Answers "how long was
//     this record viewed for", which a stateless request/response model
//     can't capture on its own — writes a `method: "VIEW"` row reusing the
//     same action-phrasing logic as a normal GET, e.g.
//     "Viewed employee 2585 for 3m 12s".
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      /** Set by `tagAuditModule` at the router-mount level. */
      auditModule?: string;
    }
  }
}

export function tagAuditModule(moduleName: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.auditModule = moduleName;
    next();
  };
}

const METHOD_VERBS: Record<string, string> = {
  GET: "Viewed",
  POST: "Created",
  PUT: "Updated",
  PATCH: "Updated",
  DELETE: "Deleted",
};

/** "employees" -> "employee", "qualification-types" -> "qualification type" */
function singularizeWord(word: string): string {
  return word.endsWith("ies")
    ? `${word.slice(0, -3)}y`
    : word.endsWith("s") && !word.endsWith("ss")
      ? word.slice(0, -1)
      : word;
}

function pluralizeWord(word: string): string {
  return `${singularizeWord(word)}s`;
}

// Action strings are capped at this length (see AuditLogEntry.action in
// openapi.yaml) — long enough to hold a full filter/payload summary while
// keeping the column bounded.
const MAX_ACTION_LENGTH = 5000;

function truncate(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max - 1)}…`;
}

// Field names never written to the audit trail in full, regardless of which
// route they came through — credentials, not business data.
const REDACTED_KEYS = new Set([
  "password",
  "passwordhash",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "token",
  "secret",
  "apikey",
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  // Dates (and anything else with a custom toJSON, e.g. Decimal-like numeric
  // wrappers) must be left as-is — rebuilding them via Object.entries below
  // would drop their toJSON and serialize them as "{}".
  if (value instanceof Date || (value && typeof (value as { toJSON?: unknown }).toJSON === "function")) {
    return value;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        REDACTED_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : redact(val),
      ]),
    );
  }
  return value;
}

/** Renders req.query as `key="value", key2="value2"` for the action detail. */
function summarizeQuery(query: Record<string, unknown>): string {
  const entries = Object.entries(query).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
}

/** Renders the request body (redacted) as compact JSON, or a text preview for non-JSON bodies. */
function summarizeBody(body: unknown): string {
  if (body === undefined || body === null) return "";
  if (typeof body === "string") {
    return body.length === 0 ? "" : JSON.stringify(truncate(body, 500));
  }
  if (typeof body === "object" && Object.keys(body as object).length === 0) return "";
  try {
    return JSON.stringify(redact(body));
  } catch {
    return "";
  }
}

// Common "display name" fields, checked in order, used to turn a bare id
// (e.g. "2585") into something a human recognizes (e.g. "James Thompson").
// Generic on purpose — works for whatever shape a route's response happens
// to be, with no per-route mapping required.
function extractLabel(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  if (typeof obj.firstName === "string" && typeof obj.lastName === "string") {
    const full = `${obj.firstName} ${obj.lastName}`.trim();
    if (full) return full;
  }
  for (const key of ["name", "label", "title", "email"]) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return null;
}

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

/** The plain "Updated role 12" / "Listed roles" phrase, shared by real requests and synthetic view-duration events. */
function baseAction(
  method: string,
  pathSegments: string[],
  module: string,
  label?: string | null,
): string {
  const verb = METHOD_VERBS[method] ?? method;

  // Drop the leading path segment only when it's the module name itself
  // (true for sysadmin/onboarding/storage/auth/search, whose routes are
  // mounted under a matching URL prefix) — NOT for modules like hr, whose
  // routes (e.g. /employees, /departments) have no such prefix.
  const rest = pathSegments[0] === module ? pathSegments.slice(1) : pathSegments;

  if (rest.length === 0) {
    return method === "GET" ? "Listed records" : `${verb} record`;
  }

  const resourceWord = rest[0].replace(/[-_]/g, " ");
  // Everything after the resource segment is an identifier, slug, or
  // sub-resource (e.g. ["lov","employee_status"] or ["employees","2585",
  // "addresses"]) — rendered literally, never grammar-mangled, since
  // singularizing an arbitrary value like "employee_status" is unsafe.
  const qualifiers = rest.slice(1);
  if (qualifiers.length === 0) {
    return method === "GET"
      ? `Listed ${pluralizeWord(resourceWord)}`
      : `${verb} ${singularizeWord(resourceWord)}`;
  }
  const qualifierText = qualifiers
    .map((q, i) => {
      // The specific record id (e.g. "2585") means nothing to a reader on
      // its own — substitute the resolved display name when we have one.
      const isTrailingId = i === qualifiers.length - 1 && /^\d+$/.test(q);
      if (isTrailingId && label) return `${label} (#${q})`;
      return q.replace(/[-_]/g, " ");
    })
    .join(" ");
  return `${verb} ${singularizeWord(resourceWord)} ${qualifierText}`;
}

function deriveAction(
  req: Request,
  pathSegments: string[],
  module: string,
  statusCode: number,
  responseBody: unknown,
): string {
  const method = req.method;
  const label = statusCode >= 200 && statusCode < 300 ? extractLabel(responseBody) : null;
  const base = baseAction(method, pathSegments, module, label);

  const details: string[] = [];
  const querySummary = summarizeQuery(req.query as Record<string, unknown>);
  if (querySummary) details.push(`filters: ${querySummary}`);

  if (BODY_METHODS.has(method)) {
    const bodySummary = summarizeBody(req.body);
    if (bodySummary) details.push(`data: ${bodySummary}`);

    // The resulting record as actually committed/returned — server-computed
    // fields (ids, timestamps, defaults) included. This is what makes the
    // trail show real committed changes, not just what was submitted.
    if (statusCode >= 200 && statusCode < 300) {
      const resultSummary = summarizeBody(responseBody);
      if (resultSummary) details.push(`result: ${resultSummary}`);
    }
  }

  const full = details.length > 0 ? `${base} (${details.join("; ")})` : base;
  return truncate(full, MAX_ACTION_LENGTH);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function deriveModule(req: Request): string {
  if (req.auditModule) return req.auditModule;
  const [first] = req.path.split("/").filter(Boolean);
  return first ?? "unknown";
}

// Excluded from the trail entirely:
//  - /healthz: infrastructure liveness probes, polled every few seconds by
//    the platform's load balancer — not a user or system interaction.
//  - /audit-log/view-duration: its whole job is to write its own, more
//    meaningful audit row (see recordViewDuration below); logging the
//    wrapper call too would just be a duplicate, less-informative entry.
const EXCLUDED_PATHS = new Set(["/healthz", "/audit-log/view-duration"]);

export function auditLogMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (EXCLUDED_PATHS.has(req.path)) {
    next();
    return;
  }

  // Capture the response payload — for mutating requests it lets "committed
  // changes" include the resulting record, not just what was submitted; for
  // GET requests it's used only to resolve a display name (see
  // extractLabel) for a bare record id, e.g. "James Thompson" for id 2585.
  let responseBody: unknown;
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    responseBody = body;
    return originalJson(body);
  }) as Response["json"];

  res.on("finish", () => {
    const module = deriveModule(req);
    const segments = req.path.split("/").filter(Boolean);
    const action = deriveAction(req, segments, module, res.statusCode, responseBody);
    const userId = req.session?.userId ?? null;

    // Fire-and-forget: never let audit logging affect request latency or
    // fail the request. Runs after the response has already been sent.
    void writeAuditEntry({
      module,
      action,
      userId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      ipAddress: req.ip ?? null,
    });
  });

  next();
}

/** Records how long a record detail page stayed open — see routes/auditLog.ts. */
export async function recordViewDuration(params: {
  module: string;
  path: string;
  durationMs: number;
  userId: number | null;
  ipAddress: string | null;
  // The frontend already has the record loaded (e.g. the employee's name)
  // — there's no HTTP response to extract a label from for this synthetic
  // event, so it's passed through directly instead.
  recordLabel?: string | null;
}): Promise<void> {
  const segments = params.path.split("/").filter(Boolean);
  const base = baseAction("GET", segments, params.module, params.recordLabel);
  const action = truncate(`${base} for ${formatDuration(params.durationMs)}`, MAX_ACTION_LENGTH);

  await writeAuditEntry({
    module: params.module,
    action,
    userId: params.userId,
    method: "VIEW",
    path: params.path,
    statusCode: 200,
    ipAddress: params.ipAddress,
    durationMs: params.durationMs,
  });
}

async function writeAuditEntry(entry: {
  module: string;
  action: string;
  userId: number | null;
  method: string;
  path: string;
  statusCode: number;
  ipAddress: string | null;
  durationMs?: number;
}): Promise<void> {
  try {
    let userName: string | null = null;
    if (entry.userId !== null) {
      const cached = userNameCache.get(entry.userId);
      if (cached !== undefined) {
        userName = cached.name;
      } else {
        const [user] = await db
          .select({ name: usersTable.name })
          .from(usersTable)
          .where(eq(usersTable.id, entry.userId))
          .limit(1);
        userName = user?.name ?? null;
        userNameCache.set(entry.userId, { name: userName });
      }
    }

    await db.insert(auditLogTable).values({
      module: entry.module,
      action: entry.action,
      userId: entry.userId,
      userName,
      method: entry.method,
      path: entry.path,
      statusCode: entry.statusCode,
      ipAddress: entry.ipAddress,
      durationMs: entry.durationMs ?? null,
    });
  } catch (err) {
    logger.error({ err, entry }, "Failed to write audit log entry");
  }
}
