/**
 * Global test setup — runs ONCE, in its own process, before any test fork.
 *
 * The suite talks to a real database that migrations leave empty. Several
 * routes depend on rows that only the boot-time seeds create (most visibly the
 * `system_config` / `onboarding_password` LOV row, without which
 * onboarding.test.ts cannot run at all), so the seeds have to happen somewhere.
 *
 * This must NOT live in `setupFiles`: that runs once per fork, and both seeds
 * read-then-write without a transaction. Concurrent forks would race —
 * `roles.name` is UNIQUE so `seedRoles` would hit a duplicate-key error, and
 * `lov_items` has no uniqueness at all so `seedLov` would silently insert
 * duplicate rows that later break lookups doing `.limit(1)`.
 *
 * `globalSetup` runs in a single process before the forks start, which removes
 * both races. Both seeds are insert-if-missing, so this is safe to re-run
 * against a database that already has them.
 */
import { pool } from "@workspace/db";
import { seedLov } from "../lib/seedLov";
import { seedRoles } from "../lib/seedRoles";

export async function setup(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to run the test suite");
  }
  await seedLov();
  await seedRoles();
  await pool.end();
}
