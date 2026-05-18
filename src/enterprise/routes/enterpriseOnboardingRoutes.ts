import express from "express";
import {
  stepEmail,
  stepEmailVerify,
  stepPassword,
  resendStepEmail,
} from "../controllers/enterpriseOnboardingController";
import { onboardingValidations } from "../../middlewares/validations/onboardingValidation";
import { requireOnboardingToken } from "../../middlewares/onboardingMiddleware";

const router = express.Router();

router.post("/step/email", onboardingValidations.validateStepEmail, stepEmail);
router.post(
  "/step/email-resend",
  onboardingValidations.validateStepEmail,
  resendStepEmail,
);
router.post(
  "/step/email-verify",
  onboardingValidations.validateStepEmailVerify,
  stepEmailVerify,
);
router.post(
  "/step/password",
  requireOnboardingToken,
  stepPassword,
);

export default router;
