import express from "express";
import { consultantOnboardingTokenOrAccessToken } from "../middlewares/consultantOnboardingTokenOrAccessToken";
import { requireConsultantSession } from "../middlewares/requireConsultantSession";
import {
  consultantOnboardingStep1,
  consultantOnboardingStep2,
  consultantOnboardingStep3,
  consultantOnboardingStep4,
  consultantOnboardingStep5,
  consultantOnboardingStep6,
  consultantOnboardingStep7,
  consultantOnboardingProfile,
  consultantOnboardingActivate,
} from "../controllers/consultantOnboardingController";

const router = express.Router();
const consultantOrAccess = consultantOnboardingTokenOrAccessToken({
  allowOnboardingToken: false,
});

router.post("/step/1", consultantOrAccess, consultantOnboardingStep1);

router.get(
  "/profile",
  consultantOrAccess,
  requireConsultantSession,
  consultantOnboardingProfile,
);
router.post(
  "/step/2",
  consultantOrAccess,
  requireConsultantSession,
  consultantOnboardingStep2,
);
router.post(
  "/step/3",
  consultantOrAccess,
  requireConsultantSession,
  consultantOnboardingStep3,
);
router.post(
  "/step/4",
  consultantOrAccess,
  requireConsultantSession,
  consultantOnboardingStep4,
);
router.post(
  "/step/5",
  consultantOrAccess,
  requireConsultantSession,
  consultantOnboardingStep5,
);
router.post(
  "/step/6",
  consultantOrAccess,
  requireConsultantSession,
  consultantOnboardingStep6,
);
router.post(
  "/step/7",
  consultantOrAccess,
  requireConsultantSession,
  consultantOnboardingStep7,
);
router.post(
  "/activate",
  consultantOrAccess,
  requireConsultantSession,
  consultantOnboardingActivate,
);

export default router;
