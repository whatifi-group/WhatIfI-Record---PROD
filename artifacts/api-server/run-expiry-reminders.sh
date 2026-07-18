#!/usr/bin/env bash
# Run via VPS cron (see: crontab -l). Not part of the app process — a
# one-shot script that queries the DB, emails a reminder digest if there's
# anything to report, and exits.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

env $(cat .env | grep -v '^#' | grep -v '^$') node dist/scripts/sendExpiryReminders.mjs
