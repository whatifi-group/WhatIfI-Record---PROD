#!/bin/bash
set -e
pnpm install --frozen-lockfile
# push-force is the non-interactive variant of push; safe for CI/post-merge
# because changes that reach main have been reviewed and tested.
FORCE=1 pnpm --filter @workspace/db push
