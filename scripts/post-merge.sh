#!/bin/bash
set -e
pnpm install --frozen-lockfile
# migrate runs each SQL file in order and stamps the hash into
# drizzle.__drizzle_migrations — keeping the journal and tracking table in sync.
# Unlike push, it never drops objects, and the test below can verify it worked.
pnpm --filter @workspace/db run migrate
# Verify the migration tracking table is in sync with the journal.
# Fails loudly if any migration was recorded in the journal but not applied
# through the runner (e.g. stamped manually without running the SQL).
pnpm --filter @workspace/db test --reporter=verbose
