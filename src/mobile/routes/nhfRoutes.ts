import express from "express";
import {
  getNhfDetail,
  nhfActions,
  patchNhfApplicability,
} from "../controllers/payrollController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  validateAssignPayrollConsultant,
  validateNhfApplicability,
  validatePayrollEvidence,
  validatePayrollPeriodParam,
  validatePayrollPeriodQuery,
} from "../../middlewares/validations/payrollValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", validatePayrollPeriodQuery, getNhfDetail);
router.patch(
  "/applicability",
  express.json(),
  validateNhfApplicability,
  patchNhfApplicability,
);
router.post(
  "/:period/evidence",
  validatePayrollPeriodParam,
  express.json(),
  validatePayrollEvidence,
  nhfActions.uploadEvidence,
);
router.post(
  "/:period/assign-consultant",
  validatePayrollPeriodParam,
  express.json(),
  validateAssignPayrollConsultant,
  nhfActions.assignConsultant,
);
router.post(
  "/:period/mark-as-paid",
  validatePayrollPeriodParam,
  nhfActions.markAsPaid,
);
router.post("/:period/pay", validatePayrollPeriodParam, nhfActions.pay);

export default router;
