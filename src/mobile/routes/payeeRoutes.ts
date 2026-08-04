import express from "express";
import {
  getPayeeDetail,
  payeeActions,
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

router.get("/", validatePayrollPeriodQuery, getPayeeDetail);
router.post(
  "/:period/evidence",
  validatePayrollPeriodParam,
  express.json(),
  validatePayrollEvidence,
  payeeActions.uploadEvidence,
);
router.post(
  "/:period/assign-consultant",
  validatePayrollPeriodParam,
  express.json(),
  validateAssignPayrollConsultant,
  payeeActions.assignConsultant,
);
router.post(
  "/:period/mark-as-paid",
  validatePayrollPeriodParam,
  payeeActions.markAsPaid,
);
router.post("/:period/pay", validatePayrollPeriodParam, payeeActions.pay);

export default router;
