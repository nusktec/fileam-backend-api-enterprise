import express from "express";
import { getFinancialPosition } from "../controllers/financialPositionController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", getFinancialPosition);

export default router;
