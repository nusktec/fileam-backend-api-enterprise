import express from "express";
import {
  stepEmail,
  stepEmailVerify,
  stepPassword,
} from "../controllers/enterpriseOnboardingController";
import { requireOnboardingToken } from "../../middlewares/onboardingMiddleware";

const router = express.Router();

router.post("/step/email", stepEmail);
router.post("/step/email-verify", stepEmailVerify);
router.post("/step/password", requireOnboardingToken, stepPassword);

export default router;
