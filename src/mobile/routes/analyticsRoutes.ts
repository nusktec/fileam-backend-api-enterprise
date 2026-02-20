import express from "express";
import { getDashboard } from "../controllers/analyticsController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/dashboard", getDashboard);

export default router;
