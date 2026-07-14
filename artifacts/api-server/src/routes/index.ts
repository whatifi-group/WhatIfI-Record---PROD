import { Router, type IRouter } from "express";
import healthRouter from "./health";
import hrRouter from "./hr";
import sysadminRouter from "./sysadmin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(hrRouter);
router.use(sysadminRouter);

export default router;
