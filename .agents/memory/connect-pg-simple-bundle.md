---
name: connect-pg-simple createTableIfMissing esbuild incompatibility
description: createTableIfMissing:true reads a bundled table.sql that esbuild never copies to dist/ — use a DB migration instead.
---

## Rule
Never use `createTableIfMissing: true` on the `connect-pg-simple` PgSession store when the server is bundled with esbuild.

## Why
`connect-pg-simple` implements `createTableIfMissing` by reading a `table.sql` file from its package directory at *runtime* using `fs.readFile`. esbuild bundles all JS into `dist/index.mjs` but does not copy the `.sql` asset file alongside it. The result is:

- Login returns HTTP 200 (auth logic succeeds)
- Session save immediately throws `ENOENT: no such file or directory, open '.../dist/table.sql'`
- Every subsequent request returns 401 because no session was persisted

## How to apply
Create the `user_sessions` table via a DB migration (Drizzle) instead:

```sql
CREATE TABLE IF NOT EXISTS "user_sessions" (
  "sid"    varchar      NOT NULL COLLATE "default",
  "sess"   json         NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");
```

The `PgSession` store config should have no `createTableIfMissing` key (or set it to `false`).
