#!/bin/bash
set -e
pnpm install --frozen-lockfile
# push-force is the non-interactive variant of push; safe for CI/post-merge
# because changes that reach main have been reviewed and tested.
FORCE=1 pnpm --filter @workspace/db push
# Verify the migration tracking table is in sync with the journal.
# Fails loudly if any migration was recorded in the journal but not applied
# through the runner (e.g. stamped manually without running the SQL).
pnpm --filter @workspace/db test --reporter=verbose
