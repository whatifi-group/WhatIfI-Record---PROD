/**
 * Idempotent role seed — runs at server startup.
 * Inserts system roles if they don't already exist; safe to re-run on every boot.
 */
import { db, rolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

interface SeedRole {
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
}

const SEED_ROLES: SeedRole[] = [
  {
    name: "HR Manager",
    description:
      "Full access to the HR module including employee directory, leave requests, and past employees. Cannot access SysAdmin pages.",
    permissions: ["hr:access", "hr:past_employees"],
    isSystem: true,
  },
];

export async function seedRoles(): Promise<void> {
  for (const role of SEED_ROLES) {
    const [existing] = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.name, role.name))
      .limit(1);

    if (!existing) {
      await db.insert(rolesTable).values({
        name: role.name,
        description: role.description,
        permissions: role.permissions as any,
        isSystem: role.isSystem,
      });
    }
  }
}
