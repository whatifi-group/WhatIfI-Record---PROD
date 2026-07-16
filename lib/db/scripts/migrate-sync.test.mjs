/**
 * Migration sync check.
 *
 * Verifies that the number of rows recorded in drizzle.__drizzle_migrations
 * matches the number of entries in the migration journal.  A mismatch means
 * at least one migration was added to the journal but never applied through
 * the runner — a common sign of "stamped manually without running the SQL".
 *
 * Requires DATABASE_URL to be set (the dev database).  Skips gracefully when
 * the env var is absent so the test does not break offline CI pipelines that
 * run the safe-push unit tests without a database.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import pg from "pg";

const DRIZZLE_FOLDER = resolve(import.meta.dirname, "../drizzle");
const JOURNAL_PATH = join(DRIZZLE_FOLDER, "meta/_journal.json");

describe("migrate-sync — journal vs __drizzle_migrations", () => {
  it("applied migration count matches journal entry count", async () => {
    if (!process.env.DATABASE_URL) {
      console.warn(
        "Skipping migrate-sync test: DATABASE_URL is not set."
      );
      return;
    }

    const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf-8"));
    const journalCount = journal.entries.length;

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await pool.query(
        `SELECT count(*)::text AS count FROM drizzle."__drizzle_migrations"`
      );
      const appliedCount = parseInt(rows[0].count, 10);

      if (appliedCount < journalCount) {
        throw new Error(
          `Migration sync mismatch: __drizzle_migrations has ${appliedCount} ` +
            `entr${appliedCount === 1 ? "y" : "ies"} but the journal lists ` +
            `${journalCount}. ${journalCount - appliedCount} migration(s) may not ` +
            `have been applied through the runner.\n` +
            `  Run: FORCE=1 pnpm --filter @workspace/db push`
        );
      }

      expect(appliedCount).toBeGreaterThanOrEqual(journalCount);
    } finally {
      await pool.end();
    }
  });
});
