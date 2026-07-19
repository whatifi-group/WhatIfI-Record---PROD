import { Router, type IRouter } from "express";
import { GetEnvironmentResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/environment", (_req, res) => {
  const environment = process.env.APP_ENV === "development" ? "development" : "production";
  const data = GetEnvironmentResponse.parse({ environment });
  res.json(data);
});

export default router;
