import { Router, type IRouter } from "express";
import rolesRouter from "./roles";
import usersRouter from "./users";
import summaryRouter from "./summary";

// SysAdmin module: user management, role management, and sysadmin summary.
// Future sysadmin sub-sections (e.g. audit logs, settings) can be added here.
const router: IRouter = Router();

router.use(rolesRouter);
router.use(usersRouter);
router.use(summaryRouter);

export default router;
