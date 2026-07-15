/**
 * Idempotent role seed — runs at server startup.
 * Inserts system roles on first boot; updates permissions + description on
 * subsequent boots so changes here are applied to existing databases automatically.
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
    permissions: [
      "hr:access",
      "hr:past_employees",
      "view_employees",
      "edit_employees",
      "view_departments",
      "edit_departments",
      "view_leave",
      "manage_leave",
      "view_reports",
      "view_disclosures",
    ],
    isSystem: true,
  },
  {
    name: "Senior Manager",
    description:
      "Senior management access including the ability to sign off on disclosure reviews. Cannot access SysAdmin pages.",
    permissions: [
      "hr:access",
      "view_employees",
      "edit_employees",
      "view_departments",
      "view_leave",
      "manage_leave",
      "view_reports",
      "view_disclosures",
      "review_disclosures",
    ],
    isSystem: true,
  },
  {
    name: "Employee Self-Service",
    description:
      "Limited role for employees who have completed self-service onboarding. Grants read-only access to own profile, the employee directory, and the ability to upload qualification certificates.",
    permissions: [
      "view_own_profile",
      "upload_qualifications",
      "view_employee_directory",
    ],
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
    } else {
      // Update permissions and description on every boot so changes here
      // are applied to existing databases without a manual migration.
      await db
        .update(rolesTable)
        .set({
          description: role.description,
          permissions: role.permissions as any,
          isSystem: role.isSystem,
        })
        .where(eq(rolesTable.id, existing.id));
    }
  }
}
