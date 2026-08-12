import express from "express";
import {
  getLiabilitySummary,
  getLiabilityDashboard,
  getCurrentLiabilities,
  getNonCurrentLiabilities,
  getAccountsPayable,
  getLiabilityCashFlowImpact,
} from "../controllers/liabilityController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

/** Six mobile Liability endpoints (Assets-parallel split). */
router.get("/summary", getLiabilitySummary);
router.get("/dashboard", getLiabilityDashboard);
router.get("/current-liabilities", getCurrentLiabilities);
router.get("/non-current-liabilities", getNonCurrentLiabilities);
router.get("/accounts-payable", getAccountsPayable);
router.get("/cash-flow-impact", getLiabilityCashFlowImpact);

export default router;
