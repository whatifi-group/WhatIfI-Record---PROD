import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, rolesTable, usersTable } from "@workspace/db";
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
      roleId: usersTable.roleId,
      roleName: rolesTable.name,
      permissions: usersTable.permissions,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .orderBy(sql`${usersTable.createdAt} desc`)
    .limit(10);

  res.json(
    GetSysadminSummaryResponse.parse({
      totalUsers: counts?.totalUsers ?? 0,
      activeUsers: counts?.activeUsers ?? 0,
      suspendedUsers: counts?.suspendedUsers ?? 0,
      totalRoles: roleCount?.totalRoles ?? 0,
      recentUsers,
    }),
  );
});

export default router;
