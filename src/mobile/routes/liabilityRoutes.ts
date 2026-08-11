import express from "express";
import {
  getLiabilitySummary,
  getLiabilityDashboard,
} from "../controllers/liabilityController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/summary", getLiabilitySummary);
router.get("/dashboard", getLiabilityDashboard);

export default router;
