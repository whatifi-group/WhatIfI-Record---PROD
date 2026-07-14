import { Router, type IRouter } from "express";
import departmentsRouter from "./departments";
import employeesRouter from "./employees";
import leaveRequestsRouter from "./leaveRequests";
import dashboardRouter from "./dashboard";

// HR module: departments, employees, leave requests, and the HR dashboard summary.
// Future modules (e.g. payroll, recruiting) should follow the same pattern:
// a self-contained folder under routes/ with its own index.ts, mounted below.
const router: IRouter = Router();

router.use(departmentsRouter);
router.use(employeesRouter);
router.use(leaveRequestsRouter);
router.use(dashboardRouter);

export default router;
