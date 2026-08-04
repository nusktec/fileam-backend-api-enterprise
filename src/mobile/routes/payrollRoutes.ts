import express from "express";
import {
  getPayrollSummary,
  downloadPayrollAnnualReport,
} from "../controllers/payrollController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { validatePayrollPeriodQuery } from "../../middlewares/validations/payrollValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", validatePayrollPeriodQuery, getPayrollSummary);
router.get(
  "/annual-report",
  validatePayrollPeriodQuery,
  downloadPayrollAnnualReport,
);

export default router;
