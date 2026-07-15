#!/usr/bin/env node
/**
 * safe-push.mjs
 *
 * A wrapper around `drizzle-kit push` that prevents accidental data loss in
 * non-interactive shells.
 *
 * Behaviour
 * ---------
 * 1. Runs `drizzle-kit push --config ./drizzle.config.ts` with `--verbose`.
 *    drizzle-kit prints the SQL it intends to run and then asks for
 *    confirmation when it detects destructive statements (DROP COLUMN,
 *    DROP TABLE, etc.).
 *
 * 2. In a non-interactive shell (no TTY) drizzle-kit will hang waiting for
 *    that confirmation. This script detects the no-TTY situation and:
 *    a. If FORCE=1 is set  → passes `--force` to skip the prompt and proceeds.
 *    b. Otherwise          → prints a prominent warning and exits with code 1.
 *
 * Usage
 * -----
 *   # Interactive shell (normal usage – prompts appear as usual):
 *   pnpm --filter @workspace/db push
 *
 *   # Non-interactive / CI, you are CERTAIN no data will be lost:
 *   FORCE=1 pnpm --filter @workspace/db push
 *
 *   # Non-interactive / CI, you want to be stopped if it is destructive:
 *   pnpm --filter @workspace/db push         ← exits 1 with a clear message
 */

import { spawnSync } from "node:child_process";

const isTTY = Boolean(process.stdin.isTTY);
const force = process.env.FORCE === "1";

const args = ["push", "--config", "./drizzle.config.ts"];

if (!isTTY) {
  if (force) {
    console.warn(
      "\n" +
        "╔══════════════════════════════════════════════════════════════════╗\n" +
        "║  ⚠  FORCE=1 detected – running drizzle-kit push --force         ║\n" +
        "║                                                                  ║\n" +
        "║  Destructive changes (DROP TABLE / DROP COLUMN) will be applied  ║\n" +
        "║  without any confirmation prompt.  Make sure you have a recent   ║\n" +
        "║  database backup before continuing.                              ║\n" +
        "╚══════════════════════════════════════════════════════════════════╝\n"
    );
    args.push("--force");
  } else {
    console.error(
      "\n" +
        "╔══════════════════════════════════════════════════════════════════╗\n" +
        "║  ✖  Schema push aborted – no interactive TTY detected           ║\n" +
        "║                                                                  ║\n" +
        "║  drizzle-kit push requires a TTY to confirm destructive changes. ║\n" +
        "║  Running it without one risks silently hanging or losing data.   ║\n" +
        "║                                                                  ║\n" +
        "║  Options:                                                        ║\n" +
        "║  • Open an interactive shell and run:                            ║\n" +
        "║      pnpm --filter @workspace/db push                            ║\n" +
        "║  • If you are certain no data will be lost (e.g. adding columns  ║\n" +
        "║    or tables only), re-run with FORCE=1:                         ║\n" +
        "║      FORCE=1 pnpm --filter @workspace/db push                    ║\n" +
        "╚══════════════════════════════════════════════════════════════════╝\n"
    );
    process.exit(1);
  }
}

const result = spawnSync("drizzle-kit", args, { stdio: "inherit" });

if (result.error) {
  console.error("Failed to launch drizzle-kit:", result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
