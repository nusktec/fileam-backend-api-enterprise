import express from "express";
import {
  createUnitAttribution,
  listUnitAttributions,
  getUnitAttribution,
  recordUnitAttributionProduction,
  getUnitAttributionSchedule,
} from "../controllers/unitAttributionController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { withPagination } from "../../middlewares/paginationMiddleware";
import { validateIdParam } from "../../middlewares/validations/mobileValidation";
import {
  createUnitAttributionValidation,
  recordUnitProductionValidation,
} from "../../middlewares/validations/unitAttributionValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.post(
  "/",
  express.json(),
  createUnitAttributionValidation,
  createUnitAttribution,
);
router.get("/", withPagination(), listUnitAttributions);
router.get("/:id", validateIdParam, getUnitAttribution);
router.post(
  "/:id/records",
  validateIdParam,
  express.json(),
  recordUnitProductionValidation,
  recordUnitAttributionProduction,
);
router.get("/:id/schedule", validateIdParam, getUnitAttributionSchedule);

export default router;
