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

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(onboardingRouter);
router.use(directoryRouter);
router.use(selfServiceRouter);
router.use(hrRouter);
router.use(sysadminRouter);
router.use(storageRouter);
router.use(searchRouter);

export default router;
