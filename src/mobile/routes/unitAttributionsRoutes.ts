import express from "express";
import {
  createUnitAttribution,
  listUnitAttributions,
  getUnitAttribution,
  recordUnitAttributionProduction,
  getUnitAttributionSchedule,
  getUnitAttributionUndoCheck,
  undoUnitAttribution,
  getUnitAttributionRecordUndoCheck,
  undoUnitAttributionRecord,
} from "../controllers/unitAttributionController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { withPagination } from "../../middlewares/paginationMiddleware";
import { validateIdParam } from "../../middlewares/validations/mobileValidation";
import {
  createUnitAttributionValidation,
  recordUnitProductionValidation,
} from "../../middlewares/validations/unitAttributionValidation";
import {
  unitAttributionRecordUndoValidation,
  unitAttributionUndoValidation,
} from "../../middlewares/validations/recordUndoValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.post(
  "/",
  express.json(),
  createUnitAttributionValidation,
  createUnitAttribution,
);
router.get("/", withPagination(), listUnitAttributions);
router.get("/:id/undo", validateIdParam, getUnitAttributionUndoCheck);
router.post(
  "/:id/undo",
  validateIdParam,
  express.json(),
  unitAttributionUndoValidation,
  undoUnitAttribution,
);
router.get(
  "/:id/records/:recordId/undo",
  validateIdParam,
  getUnitAttributionRecordUndoCheck,
);
router.post(
  "/:id/records/:recordId/undo",
  validateIdParam,
  express.json(),
  unitAttributionRecordUndoValidation,
  undoUnitAttributionRecord,
);
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
