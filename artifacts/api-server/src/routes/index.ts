import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import hrRouter from "./hr";
import sysadminRouter from "./sysadmin";
import storageRouter from "./storage";
import searchRouter from "./search";
import onboardingRouter from "./onboarding";
import directoryRouter from "./directory";
import selfServiceRouter from "./selfService";
import courseManagementRouter from "./courseManagement";
import { tagAuditModule } from "../middlewares/auditLog";

const router: IRouter = Router();

// Each mount is tagged with its module name for the SysAdmin audit trail
// (see middlewares/auditLog.ts). A new module folder mounted below should be
// tagged the same way — nothing else needs to change for it to be audited.
router.use(healthRouter);
router.use(tagAuditModule("auth"), authRouter);
router.use(tagAuditModule("onboarding"), onboardingRouter);
router.use(tagAuditModule("directory"), directoryRouter);
router.use(tagAuditModule("self-service"), selfServiceRouter);
router.use(tagAuditModule("hr"), hrRouter);
router.use(tagAuditModule("course-management"), courseManagementRouter);
router.use(tagAuditModule("sysadmin"), sysadminRouter);
router.use(tagAuditModule("storage"), storageRouter);
router.use(tagAuditModule("search"), searchRouter);

export default router;
