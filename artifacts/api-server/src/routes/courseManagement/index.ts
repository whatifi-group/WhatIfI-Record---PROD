import { Router, type IRouter } from "express";
import studentsRouter from "./students";

// Course management module: student register and (future) course/enrolment resources.
const router: IRouter = Router();

router.use(studentsRouter);

export default router;
