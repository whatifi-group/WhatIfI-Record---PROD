import { Router, type IRouter } from "express";
import { requirePermission } from "../../middlewares/requirePermission";
import rolesRouter from "./roles";
import usersRouter from "./users";
import summaryRouter from "./summary";
import lovRouter from "./lov";
import qualificationTypesRouter from "./qualificationTypes";
import notificationSettingsRouter from "./notificationSettings";

// SysAdmin module: user management, role management, list of values, and summary.
//
// Gated here at the router level rather than per-route: the frontend only
// ever grants access to /sysadmin/* pages when hasPermission('sysadmin') is
// true (see App.tsx), and every route mounted below must enforce the same
// boundary server-side — a single gate here means a new sub-router can't
// accidentally ship without it.
const router: IRouter = Router();

router.use(requirePermission(["sysadmin"]));

router.use(rolesRouter);
router.use(usersRouter);
router.use(summaryRouter);
router.use(lovRouter);
router.use(qualificationTypesRouter);
router.use(notificationSettingsRouter);

export default router;
