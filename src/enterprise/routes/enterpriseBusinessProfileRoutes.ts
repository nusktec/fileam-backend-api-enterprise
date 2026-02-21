import express from "express";
import {
  getBusinessProfile,
  getBusinessProfileActivities,
  updateBusinessProfile,
  upgradeSubscription,
} from "../controllers/enterpriseBusinessProfileController";
import { enterpriseValidations } from "../../middlewares/validations/enterpriseValidation";

const router = express.Router({ mergeParams: true });

router.get("/", getBusinessProfile);
router.get("/activities", getBusinessProfileActivities);
router.put(
  "/",
  enterpriseValidations.validateUpdateBusinessProfile,
  updateBusinessProfile,
);
router.post(
  "/subscription/upgrade",
  enterpriseValidations.validateUpgradeSubscription,
  upgradeSubscription,
);

export default router;
