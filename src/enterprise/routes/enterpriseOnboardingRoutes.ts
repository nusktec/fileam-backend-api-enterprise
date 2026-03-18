import express from "express";
import {
  stepEmail,
  stepEmailVerify,
  stepPassword,
  resendStepEmail,
} from "../controllers/enterpriseOnboardingController";
import { requireOnboardingToken } from "../../middlewares/onboardingMiddleware";

const router = express.Router();

router.post("/step/email", stepEmail);
router.post("/step/email-resend", resendStepEmail);
router.post("/step/email-verify", stepEmailVerify);
router.post(
  "/step/password",
  requireOnboardingToken,
  stepPassword,
);

export default router;
