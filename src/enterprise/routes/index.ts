import express from "express";
import { health } from "../controllers/healthController";
import onboardingRoutes from "../../routes/onboardingRoutes";
import consultantOnboardingRoutes from "./consultantOnboardingRoutes";
import enterpriseCompanyRoutes from "./enterpriseCompanyRoutes";
import { createCompany, createInvitation } from "../controllers/companyController";
import { getBusinessTypes, getIndustries } from "../controllers/enterpriseBusinessProfileController";

const router = express.Router();

router.get("/", health);
router.post("/company", createCompany);
router.post("/invitation", createInvitation);
router.get("/business-profile/types", getBusinessTypes);
router.get("/business-profile/industries", getIndustries);
router.use("/company/:companyId", enterpriseCompanyRoutes);
router.use("/onboarding", onboardingRoutes);
router.use("/consultant-onboarding", consultantOnboardingRoutes);

export default router;
