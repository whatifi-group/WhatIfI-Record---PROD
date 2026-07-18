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
//     response to finish, then derives a human-readable action from the
//     HTTP method + final path segment (e.g. POST /sysadmin/roles ->
//     "Created role") and writes one row per request. If a route wasn't
//     explicitly tagged (a module added without using the helper above),
//     it falls back to the first path segment as the module name, so
//     nothing is ever silently dropped.
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
function singularize(segment: string): string {
  const words = segment.replace(/-/g, " ");
  return words.endsWith("ies")
    ? `${words.slice(0, -3)}y`
    : words.endsWith("s") && !words.endsWith("ss")
      ? words.slice(0, -1)
      : words;
}

function deriveAction(method: string, pathSegments: string[]): string {
  const verb = METHOD_VERBS[method] ?? method;

  // Drop leading module segment (already captured separately) and any
  // numeric/id-like trailing segments, e.g. ["sysadmin","roles",":id"] -> ["roles"].
  const meaningful = pathSegments
    .slice(1)
    .filter((seg) => !/^:|^\d+$/.test(seg));

  if (meaningful.length === 0) {
    return method === "GET" ? "Listed records" : `${verb} record`;
  }

  const resource = singularize(meaningful[meaningful.length - 1]);
  const isCollection = method === "GET" && meaningful.length === 1;
  return isCollection ? `Listed ${resource}s` : `${verb} ${resource}`;
}

function deriveModule(req: Request): string {
  if (req.auditModule) return req.auditModule;
  const [first] = req.path.split("/").filter(Boolean);
  return first ?? "unknown";
}

// Excluded from the trail entirely: infrastructure liveness probes, not user
// or system interactions. Polled every few seconds by the platform's load
// balancer, so including it would drown out everything else.
const EXCLUDED_PATHS = new Set(["/healthz"]);

export function auditLogMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (EXCLUDED_PATHS.has(req.path)) {
    next();
    return;
  }

  res.on("finish", () => {
    const module = deriveModule(req);
    const segments = req.path.split("/").filter(Boolean);
    const action = deriveAction(req.method, segments);
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

async function writeAuditEntry(entry: {
  module: string;
  action: string;
  userId: number | null;
  method: string;
  path: string;
  statusCode: number;
  ipAddress: string | null;
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
    });
  } catch (err) {
    logger.error({ err, entry }, "Failed to write audit log entry");
  }
}
