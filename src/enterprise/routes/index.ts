import express from "express";
import { health } from "../controllers/healthController";
import onboardingRoutes from "../../routes/onboardingRoutes";
import consultantOnboardingRoutes from "./consultantOnboardingRoutes";
import enterpriseCompanyRoutes from "./enterpriseCompanyRoutes";
import { createCompany, createInvitation } from "../controllers/companyController";
import { getBusinessTypes, getIndustries } from "../controllers/enterpriseBusinessProfileController";
import { enterpriseValidations } from "../../middlewares/validations/enterpriseValidation";
import { authenticate } from "../../middlewares/auth/authMiddleware";

const router = express.Router();

// Public
router.get("/", health);
router.get("/business-profile/types", getBusinessTypes);
router.get("/business-profile/industries", getIndustries);

// Protected: require auth
router.post("/company", authenticate(), createCompany);
router.post("/invitation", authenticate(), createInvitation);
router.use("/company/:companyId", authenticate(), ...enterpriseValidations.validateCompanyIdParam, enterpriseCompanyRoutes);

// Onboarding flows (use their own token middleware)
router.use("/onboarding", onboardingRoutes);
router.use("/consultant-onboarding", consultantOnboardingRoutes);

export default router;
