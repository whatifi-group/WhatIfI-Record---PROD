/**
 * Idempotent admin-user seed — runs at server startup.
 *
 * Behaviour:
 *  1. Finds the Administrator role (must exist after seedRoles runs).
 *  2. If no system-account user exists yet → creates one with the seeded
 *     credentials.
 *  3. If ADMIN_SEED_PASSWORD env-var is set → resets the admin password
 *     (useful for unblocking a locked-out production instance).
 *     The env-var is intentionally consumed on every boot so a new deploy
 *     can force-reset without DB access.
 *
 * Default credentials (when no ADMIN_SEED_PASSWORD is set and no admin
 * user exists yet):
 *   email:    admin@whatifi.group
 *   password: WhatIfI@2024        ← change immediately after first login
 */
import { db, rolesTable, usersTable, userRolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "./password";
import { logger } from "./logger";

const DEFAULT_ADMIN_EMAIL = "admin@whatifi.group";
const DEFAULT_ADMIN_NAME = "System Administrator";
const DEFAULT_ADMIN_PASSWORD = "WhatIfI@2024";

export async function seedAdmin(): Promise<void> {
  // 1. Find the Administrator role
  const [adminRole] = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(eq(rolesTable.name, "Administrator"))
    .limit(1);

  if (!adminRole) {
    logger.warn("seedAdmin: Administrator role not found — skipping");
    return;
  }

  // 2. Find existing system admin user
  const [existing] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.isSystemAccount, true))
    .limit(1);

  const overridePassword = process.env.ADMIN_SEED_PASSWORD?.trim() || null;

  if (!existing) {
    // First boot — create the admin user
    const password = overridePassword ?? DEFAULT_ADMIN_PASSWORD;
    const [created] = await db
      .insert(usersTable)
      .values({
        name: DEFAULT_ADMIN_NAME,
        email: DEFAULT_ADMIN_EMAIL,
        passwordHash: hashPassword(password),
        isSystemAccount: true,
        status: "active",
        permissions: [],
      })
      .returning({ id: usersTable.id });
    await db
      .insert(userRolesTable)
      .values({ userId: created.id, roleId: adminRole.id });
    logger.info(
      { email: DEFAULT_ADMIN_EMAIL },
      "seedAdmin: created initial system administrator",
    );
    if (!overridePassword) {
      logger.warn(
        "seedAdmin: using default password — change it immediately after first login",
      );
    }
    return;
  }

  // 3. If ADMIN_SEED_PASSWORD is set, reset the password
  if (overridePassword) {
    await db
      .update(usersTable)
      .set({ passwordHash: hashPassword(overridePassword), updatedAt: new Date() })
      .where(eq(usersTable.id, existing.id));
    logger.info(
      { userId: existing.id, email: existing.email },
      "seedAdmin: admin password reset via ADMIN_SEED_PASSWORD env-var",
    );
  }
}
