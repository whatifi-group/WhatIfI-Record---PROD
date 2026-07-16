---
name: Drizzle migration tracking vs actual DB state
description: Drizzle-kit can mark a migration as applied in its tracking table without the DDL actually executing, leaving the DB missing the new tables.
---

# Drizzle Migration Tracking Bug

## The rule
After adding a new migration, always verify the tables actually exist in the DB before assuming the migration ran. A "migrations applied successfully" message from `drizzle-kit migrate` may mean "nothing new to do" (already recorded in tracking), not "just ran the SQL".

**Why:** In this project's history, a migration was added to `_journal.json` and the SQL file was created, but the `drizzle-kit migrate` run that followed recorded it in the tracking table without executing the DDL (root cause unclear — possible race between journal write and DB run). Subsequent `pnpm migrate` calls reported success because the tracking entry already existed, while the tables were absent. This caused all approval-path tests to return 500.

**How to apply:**
1. After adding a migration file, run `pnpm migrate` then immediately verify with:
   ```
   psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_name = '<new_table>';"
   ```
2. If the table is missing despite a "success" report, apply the DDL directly:
   ```
   psql "$DATABASE_URL" < lib/db/drizzle/<migration>.sql
   ```
   (Strip the `--> statement-breakpoint` markers, which psql ignores as comments.)
3. Note: `ADD CONSTRAINT IF NOT EXISTS` is not valid PostgreSQL syntax — use `CREATE TABLE IF NOT EXISTS` for tables, then add constraints without the `IF NOT EXISTS` guard (they will fail if already present, which is acceptable in a manual recovery run).
