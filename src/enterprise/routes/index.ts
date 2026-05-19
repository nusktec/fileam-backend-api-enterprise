import express from "express";
import { health } from "../controllers/healthController";
import consultantOnboardingRoutes from "./consultantOnboardingRoutes";
import enterpriseCompanyRoutes from "./enterpriseCompanyRoutes";
import enterpriseAuthRoutes from "./enterpriseAuthRoutes";
import enterpriseOnboardingRoutes from "./enterpriseOnboardingRoutes";
import { listManagedEntitiesHandler } from "../controllers/companyController";
import {
  getBusinessTypes,
  getIndustries,
} from "../controllers/enterpriseBusinessProfileController";
import { listAllBusinesses } from "../controllers/enterpriseBusinessesController";
import {
  listClients,
  listClientInvitations,
  getClientInvitation,
  cancelClientInvitation,
  resendClientInvitation,
} from "../controllers/enterpriseClientsController";
import {
  getProfile,
  updateProfile,
  getConsultantBusiness,
  updateConsultantBusiness,
  getNotificationSettings,
  updateNotificationSettings,
} from "../controllers/enterpriseUserController";
import teamManagementRoutes from "./teamManagementRoutes";
import enterpriseUploadRoutes from "./enterpriseUploadRoutes";
import {
  getComplianceStats,
  getUpcomingDeadlines,
} from "../controllers/complianceController";
import { getGlobalDashboard } from "../controllers/enterpriseDashboardController";
import {
  listAvailableClients,
  listIncomingClientRequests,
  sendClientRequest,
} from "../controllers/enterpriseClientRequestsController";
import { getContactsAndTypes } from "../controllers/contactsAndTypesController";
import { enterpriseValidations } from "../../middlewares/validations/enterpriseValidation";
import { validations as userValidations } from "../../middlewares/validations/userValidation";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireClientId } from "../middlewares/requireClientId";
import { requireEnterpriseOnboardingComplete } from "../middlewares/requireEnterpriseOnboardingComplete";

const router = express.Router();

router.get("/", health);
router.get("/business-profile/types", getBusinessTypes);
router.get("/business-profile/industries", getIndustries);

router.use("/auth", enterpriseAuthRoutes);

router.get("/profile", authenticate(), getProfile);
router.put(
  "/profile",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  userValidations.updateProfileValidation,
  updateProfile,
);
router.get(
  "/consultant-business",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  getConsultantBusiness,
);
router.put(
  "/consultant-business",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  enterpriseValidations.validateUpdateConsultantBusiness,
  updateConsultantBusiness,
);
router.get(
  "/notification-settings",
  authenticate(),
  getNotificationSettings,
);
router.put(
  "/notification-settings",
  authenticate(),
  updateNotificationSettings,
);

router.get(
  "/dashboard",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  getGlobalDashboard,
);

router.get(
  "/managed-entities",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  listManagedEntitiesHandler,
);
router.get(
  "/businesses",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  listAllBusinesses,
);
router.get(
  "/contacts-and-types",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  getContactsAndTypes,
);
router.get(
  "/clients",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  listClients,
);
router.get(
  "/clients/available",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  listAvailableClients,
);
router.get(
  "/client-requests",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  listIncomingClientRequests,
);
router.post(
  "/client-requests",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  ...enterpriseValidations.validateSendClientRequest,
  sendClientRequest,
);
router.get(
  "/client-invitations",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  listClientInvitations,
);
router.get(
  "/client-invitations/:id",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  ...enterpriseValidations.validateInvitationIdParam,
  getClientInvitation,
);
router.delete(
  "/client-invitations/:id",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  ...enterpriseValidations.validateInvitationIdParam,
  cancelClientInvitation,
);
router.post(
  "/client-invitations/:id/resend",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  ...enterpriseValidations.validateInvitationIdParam,
  resendClientInvitation,
);
router.use(
  "/clients/:clientId",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  ...enterpriseValidations.validateClientIdParam,
  requireClientId,
  enterpriseCompanyRoutes,
);

router.use("/upload", enterpriseUploadRoutes);
router.use("/onboarding", enterpriseOnboardingRoutes);
router.use("/onboarding/consultant", consultantOnboardingRoutes);
router.use("/team", teamManagementRoutes);

router.get(
  "/compliance/stats",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  getComplianceStats,
);
router.get(
  "/compliance/overview",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  getComplianceStats,
);
router.get(
  "/compliance/upcoming-deadlines",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  getUpcomingDeadlines,
);

export default router;
