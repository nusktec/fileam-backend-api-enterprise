import express from "express";
import { requireOnboardingOrAccessToken } from "../middlewares/onboardingMiddleware";
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

router.get("/profile", requireOnboardingOrAccessToken, getOnboardingProfile);
router.post("/step/email", stepEmail);
router.post("/step/email-verify", stepEmailVerify);

router.post("/step/password", requireOnboardingOrAccessToken, stepPassword);
router.post("/step/income-type", requireOnboardingOrAccessToken, stepIncomeType);
router.post("/step/tax-obligations", requireOnboardingOrAccessToken, stepTaxObligations);
router.post("/step/business-details", requireOnboardingOrAccessToken, stepBusinessDetails);
router.post("/step/tax-jurisdiction", requireOnboardingOrAccessToken, stepTaxJurisdiction);
router.post("/step/consultant-terms", requireOnboardingOrAccessToken, stepConsultantTerms);

router.post("/invite/verify-code", inviteVerifyCode);
router.post("/invite/accept-request", requireOnboardingOrAccessToken, inviteAcceptRequest);
router.post("/invite/reject-request", requireOnboardingOrAccessToken, inviteRejectRequest);

export default router;
