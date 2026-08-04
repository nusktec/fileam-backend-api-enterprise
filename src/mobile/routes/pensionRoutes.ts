import express from "express";
import {
  getPensionDetail,
  pensionActions,
} from "../controllers/payrollController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  validateAssignPayrollConsultant,
  validatePayrollEvidence,
  validatePayrollPeriodParam,
  validatePayrollPeriodQuery,
} from "../../middlewares/validations/payrollValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", validatePayrollPeriodQuery, getPensionDetail);
router.post(
  "/:period/evidence",
  validatePayrollPeriodParam,
  express.json(),
  validatePayrollEvidence,
  pensionActions.uploadEvidence,
);
router.post(
  "/:period/assign-consultant",
  validatePayrollPeriodParam,
  express.json(),
  validateAssignPayrollConsultant,
  pensionActions.assignConsultant,
);
router.post(
  "/:period/mark-as-paid",
  validatePayrollPeriodParam,
  pensionActions.markAsPaid,
);
router.post("/:period/pay", validatePayrollPeriodParam, pensionActions.pay);

export default router;
