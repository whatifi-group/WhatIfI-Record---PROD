/**
 * Maps a verified Entra identity onto a RECORD `users` row.
 *
 * Authentication has already happened by the time anything here runs — this
 * decides *which* local user the caller is, and whether they are allowed in at
 * all. Permissions are untouched: a resolved user carries exactly the roles and
 * overrides an administrator gave them in SysAdmin → Users.
 *
 * Resolution order:
 *   1. `ms_entra_object_id` — the immutable `oid`, set on first SSO sign-in.
 *   2. Lowercased email — how pre-existing users migrate; the `oid` is
 *      backfilled so later renames in Entra don't orphan the account.
 *   3. A matching employee record — auto-provision a linked user with the
 *      default role.
 * No match at any step means no sign-in; RECORD never creates an unlinked
 * account from a bare tenant identity.
 */
import { eq, sql } from "drizzle-orm";
import {
  db,
  employeesTable,
  rolesTable,
  usersTable,
  userRolesTable,
} from "@workspace/db";
import type { EntraClaims } from "./entra";
import { logger } from "./logger";

/**
 * Failure reasons. These become the `?error=` code on the /login redirect, so
 * they are deliberately coarse — the login page maps them to friendly copy and
 * the specifics stay in the server log.
 */
export type SsoFailure =
  | "no_account"
  | "inactive"
  | "ambiguous_email";

export type SsoResolution =
  | { ok: true; userId: number }
  | { ok: false; reason: SsoFailure };

/**
 * Employees who may be auto-provisioned. Leavers and inactive records must not
 * gain access just because their tenant account still exists.
 */
const PROVISIONABLE_EMPLOYEE_STATUSES = ["active", "on_leave"];

/** Role granted to auto-provisioned users — self-service access only. */
function defaultRoleName(): string {
  return process.env.SSO_DEFAULT_ROLE_NAME?.trim() || "Employee Self-Service";
}

export async function resolveSsoUser(claims: EntraClaims): Promise<SsoResolution> {
  // `users.email` carries a CHECK constraint requiring lowercase; every read
  // and write below must respect it or the insert is rejected outright.
  const email = claims.email.toLowerCase().trim();

  // 1. Known Entra object id.
  const [byObjectId] = await db
    .select({ id: usersTable.id, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.msEntraObjectId, claims.objectId))
    .limit(1);

  if (byObjectId) {
    return byObjectId.status === "active"
      ? { ok: true, userId: byObjectId.id }
      : { ok: false, reason: "inactive" };
  }

  // 2. Existing user matched by email — link it to this Entra identity.
  const [byEmail] = await db
    .select({ id: usersTable.id, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (byEmail) {
    if (byEmail.status !== "active") {
      return { ok: false, reason: "inactive" };
    }
    await db
      .update(usersTable)
      .set({ msEntraObjectId: claims.objectId, updatedAt: new Date() })
      .where(eq(usersTable.id, byEmail.id));
    logger.info(
      { userId: byEmail.id },
      "SSO: linked existing user to Entra object id",
    );
    return { ok: true, userId: byEmail.id };
  }

  // 3. Auto-provision from a matching employee record.
  //    `employees.email` is neither unique nor lowercase-normalised, so match
  //    case-insensitively and treat more than one hit as unresolvable rather
  //    than guessing which person signed in.
  const employees = await db
    .select({
      id: employeesTable.id,
      status: employeesTable.status,
      linkedUserId: usersTable.id,
    })
    .from(employeesTable)
    .leftJoin(usersTable, eq(usersTable.employeeId, employeesTable.id))
    .where(sql`lower(${employeesTable.email}) = ${email}`);

  if (employees.length === 0) return { ok: false, reason: "no_account" };
  if (employees.length > 1) {
    logger.warn(
      { email, count: employees.length },
      "SSO: refusing sign-in — multiple employee records share this email",
    );
    return { ok: false, reason: "ambiguous_email" };
  }

  const [employee] = employees;

  // Already linked to a user, but that user's email differs from the tenant
  // address (step 2 missed it). Linking here would give one person two
  // accounts, so refuse and let an administrator reconcile it.
  if (employee.linkedUserId !== null) {
    logger.warn(
      { employeeId: employee.id, userId: employee.linkedUserId },
      "SSO: employee already linked to a user with a different email",
    );
    return { ok: false, reason: "no_account" };
  }

  if (!PROVISIONABLE_EMPLOYEE_STATUSES.includes(employee.status)) {
    logger.info(
      { employeeId: employee.id, status: employee.status },
      "SSO: refusing sign-in — employee record is not active",
    );
    return { ok: false, reason: "no_account" };
  }

  const roleName = defaultRoleName();
  const [role] = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(eq(rolesTable.name, roleName))
    .limit(1);

  if (!role) {
    logger.error(
      { roleName },
      "SSO: cannot auto-provision — default role not found",
    );
    return { ok: false, reason: "no_account" };
  }

  const userId = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(usersTable)
      .values({
        name: claims.name,
        email,
        // No password — this account signs in through Microsoft only.
        passwordHash: null,
        msEntraObjectId: claims.objectId,
        status: "active",
        permissions: [],
        isSystemAccount: false,
        employeeId: employee.id,
      })
      .returning({ id: usersTable.id });

    await tx.insert(userRolesTable).values({ userId: user.id, roleId: role.id });
    return user.id;
  });

  logger.info(
    { userId, employeeId: employee.id, roleName },
    "SSO: auto-provisioned user from employee record",
  );
  return { ok: true, userId };
}
