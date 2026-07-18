import { Router, type IRouter } from "express";
import departmentsRouter from "./departments";
import employeesRouter from "./employees";
import employeeAddressesRouter from "./employeeAddresses";
import employeePayrollRouter from "./employeePayroll";
import employeeAttachmentsRouter from "./employeeAttachments";
import employeeMedicalRouter from "./employeeMedical";
import employeeDietaryRouter from "./employeeDietary";
import employeeNextOfKinRouter from "./employeeNextOfKin";
import employeeQualificationsRouter from "./employeeQualifications";
import employeeWorkRecordsRouter from "./employeeWorkRecords";
import employeePayRatesRouter from "./employeePayRates";
import employeeServicePeriodsRouter from "./employeeServicePeriods";
import employeeDisclosuresRouter from "./employeeDisclosures";
import employeePhonesRouter from "./employeePhones";
import employeeNextOfKinPhonesRouter from "./employeeNextOfKinPhones";
import leaveRequestsRouter from "./leaveRequests";

import { payrollVisibilityMiddleware, salaryRedactionMiddleware } from "../../lib/salaryGuard";

// HR module: departments, employees, leave requests, and employee section sub-resources.
// Future modules (e.g. payroll, recruiting) should follow the same pattern:
// a self-contained folder under routes/ with its own index.ts, mounted below.
//
// Unlike routes/sysadmin/index.ts, this module deliberately does NOT apply a
// single blanket permission gate here — routes in this module are meant to be
// reachable by narrow, resource-specific roles (e.g. a role with only
// view_payroll and nothing else, for an external payroll contractor) without
// requiring a separate umbrella permission on top. Every route below MUST
// therefore call requirePermission([...]) itself with the correct permission
// for that resource. See src/test/hrRouterAuthGuard.test.ts, which asserts
// every mounted route rejects a caller with no relevant permission — run it
// after adding a new route here.
const router: IRouter = Router();

// 1. Pre-compute req.canViewPayroll for every HR request.
// 2. salaryRedactionMiddleware intercepts res.json() and automatically strips
//    the salary field from any employee-shaped response when the caller lacks
//    payroll permission.  Individual route handlers do NOT call redactSalary —
//    they just call res.json() and redaction is applied centrally.
router.use(payrollVisibilityMiddleware);
router.use(salaryRedactionMiddleware);

router.use(departmentsRouter);
router.use(employeesRouter);
router.use(employeeAddressesRouter);
router.use(employeePayrollRouter);
router.use(employeeAttachmentsRouter);
router.use(employeeMedicalRouter);
router.use(employeeDietaryRouter);
router.use(employeeNextOfKinRouter);
router.use(employeeQualificationsRouter);
router.use(employeeWorkRecordsRouter);
router.use(employeePayRatesRouter);
router.use(employeeServicePeriodsRouter);
router.use(employeeDisclosuresRouter);
router.use(employeePhonesRouter);
router.use(employeeNextOfKinPhonesRouter);
router.use(leaveRequestsRouter);

export default router;
