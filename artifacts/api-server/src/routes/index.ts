import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storesRouter from "./stores";
import capturesRouter from "./captures";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storesRouter);
router.use(capturesRouter);

export default router;
