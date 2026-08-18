import express from "express";
import {
  createPrepayment,
  listPrepayments,
  getPrepayment,
  updatePrepayment,
  assignPrepaymentConsultant,
  addPrepaymentEvidence,
  cancelPrepayment,
} from "../controllers/prepaymentsController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  createPrepaymentValidation,
  updatePrepaymentValidation,
  assignPrepaymentConsultantValidation,
  addPrepaymentEvidenceValidation,
  cancelPrepaymentValidation,
} from "../../middlewares/validations/prepaymentValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.post("/", express.json(), createPrepaymentValidation, createPrepayment);
router.get("/", listPrepayments);
router.get("/:prepaymentId", getPrepayment);
router.patch(
  "/:prepaymentId",
  express.json(),
  updatePrepaymentValidation,
  updatePrepayment,
);
router.post(
  "/:prepaymentId/assign-consultant",
  express.json(),
  assignPrepaymentConsultantValidation,
  assignPrepaymentConsultant,
);
router.post(
  "/:prepaymentId/evidence",
  express.json(),
  addPrepaymentEvidenceValidation,
  addPrepaymentEvidence,
);
router.post(
  "/:prepaymentId/cancel",
  express.json(),
  cancelPrepaymentValidation,
  cancelPrepayment,
);

export default router;
