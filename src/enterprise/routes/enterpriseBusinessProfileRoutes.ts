import express from "express";
import {
  getBusinessProfile,
  getBusinessProfileActivities,
  updateBusinessProfile,
  upgradeSubscription,
  getBusinessTypes,
  getIndustries,
} from "../controllers/enterpriseBusinessProfileController";

const router = express.Router({ mergeParams: true });

router.get("/", getBusinessProfile);
router.get("/activities", getBusinessProfileActivities);
router.put("/", updateBusinessProfile);
router.post("/subscription/upgrade", upgradeSubscription);

export default router;
