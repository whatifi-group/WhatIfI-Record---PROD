import { Router, type IRouter } from "express";
import { desc, eq, gte, sql } from "drizzle-orm";
import {
  db,
  departmentsTable,
  employeesTable,
  leaveRequestsTable,
} from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  req.log.info("Building dashboard summary");

  const [counts] = await db
    .select({
      totalEmployees: sql<number>`count(*)::int`,
      activeEmployees: sql<number>`count(*) filter (where ${employeesTable.status} = 'active')::int`,
      onLeaveEmployees: sql<number>`count(*) filter (where ${employeesTable.status} = 'on_leave')::int`,
    })
    .from(employeesTable);

  const [{ totalDepartments }] = await db
    .select({ totalDepartments: sql<number>`count(*)::int` })
    .from(departmentsTable);

  const [{ pendingLeaveRequests }] = await db
    .select({ pendingLeaveRequests: sql<number>`count(*)::int` })
    .from(leaveRequestsTable)
    .where(eq(leaveRequestsTable.status, "pending"));

  const departmentBreakdown = await db
    .select({
      departmentId: departmentsTable.id,
      departmentName: departmentsTable.name,
      count: sql<number>`count(${employeesTable.id})::int`,
    })
    .from(departmentsTable)
    .leftJoin(
      employeesTable,
      eq(employeesTable.departmentId, departmentsTable.id),
    )
    .groupBy(departmentsTable.id)
    .orderBy(departmentsTable.name);

  const recentHires = await db
    .select({
      id: employeesTable.id,
      firstName: employeesTable.firstName,
      lastName: employeesTable.lastName,
      email: employeesTable.email,
      phone: employeesTable.phone,
      jobTitle: employeesTable.jobTitle,
      departmentId: employeesTable.departmentId,
      departmentName: departmentsTable.name,
      employmentType: employeesTable.employmentType,
      status: employeesTable.status,
      startDate: employeesTable.startDate,
      salary: sql<number | null>`${employeesTable.salary}::float8`,
      avatarUrl: employeesTable.avatarUrl,
      createdAt: employeesTable.createdAt,
    })
    .from(employeesTable)
    .leftJoin(
      departmentsTable,
      eq(employeesTable.departmentId, departmentsTable.id),
    )
    .orderBy(desc(employeesTable.startDate))
    .limit(5);

  const upcomingLeave = await db
    .select({
      id: leaveRequestsTable.id,
      employeeId: leaveRequestsTable.employeeId,
      employeeName: sql<string>`${employeesTable.firstName} || ' ' || ${employeesTable.lastName}`,
      type: leaveRequestsTable.type,
      startDate: leaveRequestsTable.startDate,
      endDate: leaveRequestsTable.endDate,
      status: leaveRequestsTable.status,
      reason: leaveRequestsTable.reason,
      createdAt: leaveRequestsTable.createdAt,
    })
    .from(leaveRequestsTable)
    .innerJoin(
      employeesTable,
      eq(leaveRequestsTable.employeeId, employeesTable.id),
    )
    .where(
      sql`${leaveRequestsTable.status} = 'approved' and ${leaveRequestsTable.endDate} >= current_date`,
    )
    .orderBy(leaveRequestsTable.startDate)
    .limit(5);

  res.json(
    GetDashboardSummaryResponse.parse({
      totalEmployees: counts.totalEmployees,
      activeEmployees: counts.activeEmployees,
      onLeaveEmployees: counts.onLeaveEmployees,
      totalDepartments,
      pendingLeaveRequests,
      departmentBreakdown,
      recentHires,
      upcomingLeave,
    }),
  );
});

export default router;
