import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";
import fs from "fs";
import crypto from "crypto";

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

/**
 * Stamps all known migrations as already-applied in __drizzle_migrations.
 *
 * Called when the database was previously set up via `drizzle-kit push` (which
 * creates tables without recording anything in __drizzle_migrations). Without
 * this step the programmatic migrator would try to re-run the baseline migration
 * and fail because the tables already exist.
 *
 * Safe to call on a fresh database — if no tables are present it does nothing and
 * lets the regular migrator create everything from scratch.
 */
async function bootstrapMigrationHistory(
  pool: pg.Pool,
  migrationsFolder: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    // Drizzle stores migration history in the "drizzle" schema.
    await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
        id         SERIAL  PRIMARY KEY,
        hash       text    NOT NULL,
        created_at bigint
      )
    `);

    // If any migrations are already recorded there is nothing to bootstrap.
    const { rows: recorded } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM drizzle."__drizzle_migrations"`,
    );
    if (parseInt(recorded[0].count, 10) > 0) {
      return;
    }

    // Check whether this is a push-initialised database by probing for a
    // core table that has always been part of the baseline migration.
    const { rows: existing } = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE  table_schema = 'public'
        AND    table_name   = 'departments'
      ) AS exists
    `);

    if (!existing[0].exists) {
      // Truly empty database — the regular migrator will create everything.
      return;
    }

    // Push-initialised DB: stamp every migration in the journal as applied so
    // the migrator skips them and only runs genuinely new migrations.
    const journalPath = path.join(migrationsFolder, "meta/_journal.json");
    const journal: Journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));

    for (const entry of journal.entries) {
      const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
      const sqlContent = fs.readFileSync(sqlPath, "utf8");
      const hash = crypto.createHash("sha256").update(sqlContent).digest("hex");
      await client.query(
        `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
        [hash, entry.when],
      );
    }
  } finally {
    client.release();
  }
}

/**
 * Applies all pending Drizzle migrations to the database.
 * Runs entirely non-interactively — safe for CI, workflows, and non-TTY shells.
 * Idempotent: already-applied migrations are skipped via the __drizzle_migrations table.
 *
 * Handles databases that were previously initialised with `drizzle-kit push` by
 * bootstrapping the migration history before the first managed run.
 *
 * @param migrationsFolder - absolute path to the folder containing the SQL migration
 *   files and meta/_journal.json. Callers must supply this because the library is
 *   bundled by esbuild and __dirname resolves to the caller's dist directory, not the
 *   db package source tree.
 */
export async function runMigrations(migrationsFolder: string): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  const { Pool } = pg;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await bootstrapMigrationHistory(pool, migrationsFolder);

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
