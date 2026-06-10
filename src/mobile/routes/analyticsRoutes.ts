import express from "express";
import { getDashboard, getFinancialOverview } from "../controllers/analyticsController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/financial-overview", getFinancialOverview);
router.get("/dashboard", getDashboard);

export default router;
