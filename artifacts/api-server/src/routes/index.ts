import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import hrRouter from "./hr";
import sysadminRouter from "./sysadmin";
import storageRouter from "./storage";
import searchRouter from "./search";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(hrRouter);
router.use(sysadminRouter);
router.use(storageRouter);
router.use(searchRouter);

export default router;
