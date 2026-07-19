import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { db, rolesTable, usersTable, userRolesTable } from "@workspace/db";
import { GetSysadminSummaryResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/sysadmin/summary", async (req, res): Promise<void> => {
  const [counts] = await db
    .select({
      totalUsers: sql<number>`cast(count(*) as int)`,
      activeUsers: sql<number>`cast(sum(case when ${usersTable.status} = 'active' then 1 else 0 end) as int)`,
      suspendedUsers: sql<number>`cast(sum(case when ${usersTable.status} = 'suspended' then 1 else 0 end) as int)`,
    })
    .from(usersTable);

  const [roleCount] = await db
    .select({ totalRoles: sql<number>`cast(count(*) as int)` })
    .from(rolesTable);

  // Recent users (last 10 created)
  const recentUsers = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      status: usersTable.status,
      permissions: usersTable.permissions,
      isSystemAccount: usersTable.isSystemAccount,
      employeeId: usersTable.employeeId,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(sql`${usersTable.createdAt} desc`)
    .limit(10);

  const roleLinks = recentUsers.length > 0
    ? await db
        .select({ userId: userRolesTable.userId, id: rolesTable.id, name: rolesTable.name })
        .from(userRolesTable)
        .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
        .where(inArray(userRolesTable.userId, recentUsers.map((u) => u.id)))
    : [];
  const rolesByUser = new Map<number, { id: number; name: string }[]>();
  for (const link of roleLinks) {
    rolesByUser.set(link.userId, [
      ...(rolesByUser.get(link.userId) ?? []),
      { id: link.id, name: link.name },
    ]);
  }
  const recentUsersWithRoles = recentUsers.map((u) => ({
    ...u,
    roles: rolesByUser.get(u.id) ?? [],
  }));

  res.json(
    GetSysadminSummaryResponse.parse({
      totalUsers: counts?.totalUsers ?? 0,
      activeUsers: counts?.activeUsers ?? 0,
      suspendedUsers: counts?.suspendedUsers ?? 0,
      totalRoles: roleCount?.totalRoles ?? 0,
      recentUsers: recentUsersWithRoles,
    }),
  );
});

export default router;
