import express from "express";
import {
  getProfile,
  updateProfile,
  changePassword,
  getBusinessProfile,
  updateBusinessProfile,
  getNotificationSettings,
  updateNotificationSettings,
  getConsultant,
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
router.put("/business-profile", express.json(), updateBusinessProfile);
router.get("/notification-settings", getNotificationSettings);
router.put(
  "/notification-settings",
  express.json(),
  updateNotificationSettings,
);
router.get("/consultant", getConsultant);
router.post("/consultant/revoke", express.json(), revokeConsultant);

export default router;
