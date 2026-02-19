import express from "express";
import { requireOnboardingToken } from "../middlewares/onboardingMiddleware";
import {
  stepEmail,
  stepEmailVerify,
  stepPassword,
  stepIncomeType,
  stepTaxObligations,
  stepBusinessDetails,
  stepTaxJurisdiction,
  stepConsultantTerms,
  getOnboardingProfile,
  inviteVerifyCode,
  inviteAcceptRequest,
  inviteRejectRequest,
} from "../mobile/controllers/onboardingController";

const router = express.Router();

router.get("/profile", requireOnboardingToken, getOnboardingProfile);
router.post("/step/email", stepEmail);
router.post("/step/email-verify", stepEmailVerify);

router.post("/step/password", requireOnboardingToken, stepPassword);
router.post("/step/income-type", requireOnboardingToken, stepIncomeType);
router.post("/step/tax-obligations", requireOnboardingToken, stepTaxObligations);
router.post("/step/business-details", requireOnboardingToken, stepBusinessDetails);
router.post("/step/tax-jurisdiction", requireOnboardingToken, stepTaxJurisdiction);
router.post("/step/consultant-terms", requireOnboardingToken, stepConsultantTerms);

router.post("/invite/verify-code", inviteVerifyCode);
router.post("/invite/accept-request", requireOnboardingToken, inviteAcceptRequest);
router.post("/invite/reject-request", requireOnboardingToken, inviteRejectRequest);

export default router;
