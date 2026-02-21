import express from "express";
import { requireConsultantOnboardingToken } from "../middlewares/requireConsultantOnboardingToken";
import {
  consultantOnboardingStep1,
  consultantOnboardingStep2,
  consultantOnboardingStep3,
  consultantOnboardingStep4,
  consultantOnboardingStep5,
  consultantOnboardingStep6,
  consultantOnboardingStep7,
  consultantOnboardingProfile,
  consultantOnboardingReviewSubmit,
  consultantOnboardingActivate,
} from "../controllers/consultantOnboardingController";

const router = express.Router();

router.post("/step/1", consultantOnboardingStep1);

router.get("/profile", requireConsultantOnboardingToken, consultantOnboardingProfile);
router.post("/step/2", requireConsultantOnboardingToken, consultantOnboardingStep2);
router.post("/step/3", requireConsultantOnboardingToken, consultantOnboardingStep3);
router.post("/step/4", requireConsultantOnboardingToken, consultantOnboardingStep4);
router.post("/step/5", requireConsultantOnboardingToken, consultantOnboardingStep5);
router.post("/step/6", requireConsultantOnboardingToken, consultantOnboardingStep6);
router.post("/step/7", requireConsultantOnboardingToken, consultantOnboardingStep7);
router.post("/review-submit", requireConsultantOnboardingToken, consultantOnboardingReviewSubmit);
router.post("/activate", requireConsultantOnboardingToken, consultantOnboardingActivate);

export default router;
