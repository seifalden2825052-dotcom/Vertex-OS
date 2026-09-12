import { Router, type IRouter } from "express";
import healthRouter from "./health";
import copilotRouter from "./copilot";
import workspaceRouter from "./workspace";
import copilotHistoryRouter from "./copilot-history";

const router: IRouter = Router();

router.use(healthRouter);
router.use(copilotRouter);
router.use(workspaceRouter);
router.use(copilotHistoryRouter);

export default router;
