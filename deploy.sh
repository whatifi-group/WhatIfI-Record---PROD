#!/usr/bin/env bash
# Redeploy script for the VPS. Run this after pushing changes to origin/main.
#
# What it does:
#   1. Pull the latest commit on main (fast-forward only — aborts if the
#      working tree is dirty or history has diverged, rather than guessing).
#   2. Install dependencies workspace-wide.
#   3. Build artifacts/api-server and restart it under pm2 (this also runs
#      any new DB migrations automatically, since that happens at app boot).
#   4. Build artifacts/hr-management and sync the static output into the
#      nginx web root.
#   5. Reload nginx.
#
# Safe to re-run; every step is idempotent.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="/var/www/whatifi-record/public"
PM2_APP="whatifi-api-server"

cd "$REPO_DIR"

echo "==> Pulling latest changes"
git pull --ff-only origin main

echo "==> Installing dependencies"
pnpm install

echo "==> Building api-server"
pnpm --filter @workspace/api-server run build

echo "==> Building hr-management (frontend)"
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/hr-management run build

echo "==> Syncing frontend build to $WEB_ROOT"
rsync -a --delete "$REPO_DIR/artifacts/hr-management/dist/public/" "$WEB_ROOT/"
chown -R www-data:www-data "$WEB_ROOT"
find "$WEB_ROOT" -type d -exec chmod 755 {} \;
find "$WEB_ROOT" -type f -exec chmod 644 {} \;

echo "==> Restarting api-server (pm2)"
pm2 restart "$PM2_APP" --update-env
pm2 save

echo "==> Reloading nginx"
nginx -t
systemctl reload nginx

echo "==> Waiting for app to come up"
for i in $(seq 1 15); do
  if curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/healthz | grep -q 200; then
    echo "==> Healthy"
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "!! api-server did not become healthy in time — check: pm2 logs $PM2_APP" >&2
    exit 1
  fi
  sleep 1
done

echo "==> Deploy complete"
pm2 list
