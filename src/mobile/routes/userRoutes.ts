import express from "express";
import {
  getProfile,
  updateProfile,
  changePassword,
  getBusinessProfile,
  updateBusinessProfile,
  getTaxEligibilityProfile,
  getNotificationSettings,
  updateNotificationSettings,
  getConsultant,
  patchConsultantFilingAuthorization,
  revokeConsultant,
} from "../controllers/userController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { validations } from "../../middlewares/validations/userValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/profile", getProfile);
router.put("/profile", validations.updateProfileValidation, updateProfile);
router.patch("/password", validations.changePasswordValidation, changePassword);
router.get("/business-profile", getBusinessProfile);
router.get("/tax-eligibility-profile", getTaxEligibilityProfile);
router.put(
  "/business-profile",
  express.json(),
  validations.updateBusinessProfileValidation,
  updateBusinessProfile,
);
router.get("/notification-settings", getNotificationSettings);
router.put(
  "/notification-settings",
  express.json(),
  updateNotificationSettings,
);
router.get("/consultant", getConsultant);
router.patch(
  "/consultant/filing-authorization",
  express.json(),
  patchConsultantFilingAuthorization,
);
router.post("/consultant/revoke", express.json(), revokeConsultant);

export default router;
