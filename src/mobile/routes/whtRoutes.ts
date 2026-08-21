import express from "express";
import { getWhtCredits } from "../controllers/whtCreditsController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/credits", getWhtCredits);

export default router;
