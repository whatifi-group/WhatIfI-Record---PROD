# @workspace/db

Shared database package: schema, migrations, and the `runMigrations()` bootstrap helper used by the API server.

---

## Applying schema changes

**Always use the migration runner — never apply raw SQL by hand.**

Raw SQL applied outside the runner leaves `drizzle.__drizzle_migrations` out of sync, which causes the server to attempt re-running migrations on every restart and means production will silently miss the change until a fresh deploy stamps it.

### 1. Generate a migration file

After editing the Drizzle schema in `src/schema/`, generate a new SQL migration:

```bash
pnpm --filter @workspace/db generate
```

This writes a new `lib/db/drizzle/<tag>.sql` file and updates `meta/_journal.json`.
Commit both files alongside your schema changes.

### 2. Apply the migration

| Situation | Command |
|---|---|
| Interactive shell (dev day-to-day) | `pnpm --filter @workspace/db push` |
| Non-interactive / CI / post-merge (no TTY) | `FORCE=1 pnpm --filter @workspace/db push` |

`FORCE=1` bypasses the destructive-change confirmation prompt.  Only use it when you are certain no columns or tables are being dropped, or you have reviewed the generated SQL and accepted the risk.

The `push` script (`lib/db/scripts/safe-push.mjs`) will refuse to run without a TTY unless `FORCE=1` is set, so accidents in CI are caught early.

### 3. Post-merge (automatic)

The post-merge hook (`scripts/post-merge.sh`) runs `FORCE=1 pnpm --filter @workspace/db push` automatically after every task merge, so merged schema changes are applied to the shared dev database without manual intervention.

---

## Migration tracking

Drizzle records applied migrations in `drizzle.__drizzle_migrations`.  The API server calls `runMigrations()` at startup, which:

1. Bootstraps the tracking table if it is missing (handles databases that were previously set up via `drizzle-kit push`).
2. Stamps all already-applied migrations so they are not re-run.
3. Applies any pending migrations in journal order.
4. Emits a **warning** if the number of rows in `__drizzle_migrations` is less than the number of entries in `meta/_journal.json` after the run, so drift is visible in server logs.

---

## Package scripts

| Script | Purpose |
|---|---|
| `pnpm --filter @workspace/db generate` | Generate a new migration from schema changes |
| `pnpm --filter @workspace/db push` | Apply pending migrations (interactive) |
| `FORCE=1 pnpm --filter @workspace/db push` | Apply pending migrations (non-interactive) |
