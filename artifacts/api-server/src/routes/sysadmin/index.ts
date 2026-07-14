import { Router, type IRouter } from "express";
import rolesRouter from "./roles";
import usersRouter from "./users";
import summaryRouter from "./summary";
import lovRouter from "./lov";
import qualificationTypesRouter from "./qualificationTypes";

// SysAdmin module: user management, role management, list of values, and summary.
const router: IRouter = Router();

router.use(rolesRouter);
router.use(usersRouter);
router.use(summaryRouter);
router.use(lovRouter);
router.use(qualificationTypesRouter);

export default router;
