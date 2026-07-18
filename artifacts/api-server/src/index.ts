import app from "./app";
import { logger } from "./lib/logger";
import { seedLov, assertLovSync } from "./lib/seedLov";
import { seedRoles } from "./lib/seedRoles";
import { seedAdmin } from "./lib/seedAdmin";
import { seedNotificationSettings } from "./lib/seedNotificationSettings";
import { runMigrations, db } from "@workspace/db";
import { sql } from "drizzle-orm";
import path from "path";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// __dirname is injected by esbuild banner and points to the dist/ directory.
// The build step copies lib/db/drizzle/ → dist/drizzle/ so migrations are
// always co-located with the compiled bundle.
const migrationsFolder = path.join(__dirname, "drizzle");

/**
 * Ensure the connect-pg-simple session table exists.
 *
 * We cannot use `createTableIfMissing: true` on the PgSession store because
 * that feature reads a table.sql asset file at runtime — a file that esbuild
 * never copies into dist/.  Instead we run the DDL directly here after
 * migrations so it is always present, even if drizzle-kit push --force drops
 * it (push drops tables that are not in the Drizzle schema).
 */
async function ensureSessionTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_sessions" (
      "sid"    varchar      NOT NULL COLLATE "default",
      "sess"   json         NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire"
      ON "user_sessions" ("expire")
  `);
}

runMigrations(migrationsFolder)
  .then(() => {
    logger.info("Database migrations applied");
    return ensureSessionTable();
  })
  .then(() => {
    return Promise.all([
      seedLov().then(() => assertLovSync()),
      seedRoles(),
      seedNotificationSettings(),
    ]);
  })
  .then(() => seedAdmin())
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Startup failed — aborting");
    process.exit(1);
  });
