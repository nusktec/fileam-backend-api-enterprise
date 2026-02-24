import express from "express";
import { health } from "../controllers/healthController";
import onboardingRoutes from "../../routes/onboardingRoutes";
import consultantOnboardingRoutes from "./consultantOnboardingRoutes";
import enterpriseCompanyRoutes from "./enterpriseCompanyRoutes";
import {
  createCompany,
  createInvitation,
} from "../controllers/companyController";
import {
  getBusinessTypes,
  getIndustries,
} from "../controllers/enterpriseBusinessProfileController";
import { enterpriseValidations } from "../../middlewares/validations/enterpriseValidation";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireCompanyId } from "../middlewares/requireCompanyId";

const router = express.Router();

router.get("/", health);
router.get("/business-profile/types", getBusinessTypes);
router.get("/business-profile/industries", getIndustries);

router.post("/company", authenticate(), ...enterpriseValidations.validateCreateCompany, createCompany);
router.post("/invitation", authenticate(), ...enterpriseValidations.validateCreateInvitation, createInvitation);
router.use(
  "/company/:companyId",
  authenticate(),
  ...enterpriseValidations.validateCompanyIdParam,
  requireCompanyId,
  enterpriseCompanyRoutes,
);

router.use("/onboarding", onboardingRoutes);
router.use("/consultant-onboarding", consultantOnboardingRoutes);

export default router;
