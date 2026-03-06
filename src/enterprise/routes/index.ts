import express from "express";
import { health } from "../controllers/healthController";
import consultantOnboardingRoutes from "./consultantOnboardingRoutes";
import enterpriseCompanyRoutes from "./enterpriseCompanyRoutes";
import enterpriseAuthRoutes from "./enterpriseAuthRoutes";
import enterpriseOnboardingRoutes from "./enterpriseOnboardingRoutes";
import {
  createCompany,
  createInvitation,
  listCompanies,
} from "../controllers/companyController";
import {
  getBusinessTypes,
  getIndustries,
} from "../controllers/enterpriseBusinessProfileController";
import { listAllBusinesses } from "../controllers/enterpriseBusinessesController";
import { listClients, searchClients } from "../controllers/enterpriseClientsController";
import { enterpriseValidations } from "../../middlewares/validations/enterpriseValidation";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireCompanyId } from "../middlewares/requireCompanyId";
import { requireEnterpriseOnboardingComplete } from "../middlewares/requireEnterpriseOnboardingComplete";

const router = express.Router();

router.get("/", health);
router.get("/business-profile/types", getBusinessTypes);
router.get("/business-profile/industries", getIndustries);

router.use("/auth", enterpriseAuthRoutes);

router.get("/companies", authenticate(), listCompanies);
router.get(
  "/businesses",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  listAllBusinesses,
);
router.post(
  "/company",
  authenticate(),
  ...enterpriseValidations.validateCreateCompany,
  createCompany,
);
router.post(
  "/invitation",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  ...enterpriseValidations.validateCreateInvitation,
  createInvitation,
);
router.get(
  "/clients",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  listClients,
);
router.get(
  "/clients/search",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  searchClients,
);
router.use(
  "/company/:companyId",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  ...enterpriseValidations.validateCompanyIdParam,
  requireCompanyId,
  enterpriseCompanyRoutes,
);

router.use("/onboarding", enterpriseOnboardingRoutes);
router.use("/consultant-onboarding", consultantOnboardingRoutes);

export default router;
