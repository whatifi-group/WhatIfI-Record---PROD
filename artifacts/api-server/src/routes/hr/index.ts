import { Router, type IRouter } from "express";
import departmentsRouter from "./departments";
import employeesRouter from "./employees";
import leaveRequestsRouter from "./leaveRequests";
import employeeAddressesRouter from "./employeeAddresses";
import employeePayrollRouter from "./employeePayroll";
import employeeAttachmentsRouter from "./employeeAttachments";
import employeeMedicalRouter from "./employeeMedical";
import employeeDietaryRouter from "./employeeDietary";
import employeeNextOfKinRouter from "./employeeNextOfKin";
import employeeQualificationsRouter from "./employeeQualifications";
import employeeWorkRecordsRouter from "./employeeWorkRecords";

// HR module: departments, employees, leave requests, and employee section sub-resources.
// Future modules (e.g. payroll, recruiting) should follow the same pattern:
// a self-contained folder under routes/ with its own index.ts, mounted below.
const router: IRouter = Router();

router.use(departmentsRouter);
router.use(employeesRouter);
router.use(leaveRequestsRouter);
router.use(employeeAddressesRouter);
router.use(employeePayrollRouter);
router.use(employeeAttachmentsRouter);
router.use(employeeMedicalRouter);
router.use(employeeDietaryRouter);
router.use(employeeNextOfKinRouter);
router.use(employeeQualificationsRouter);
router.use(employeeWorkRecordsRouter);

export default router;
