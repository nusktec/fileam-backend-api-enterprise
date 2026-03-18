import express from "express";
import {
  getVatStatus,
  initiateVatSetup,
  getVatTypes,
  getVatPeriods,
  calculateVat,
  getVatResults,
  downloadVatReport,
  submitVatReturn,
  getMonthlyVatPayable,
  getThresholdStatus,
  getThresholdInfo,
  getVatFiling12MonthStats,
  getTaxBreakdown,
  getVatComputation,
  getPayeComputation,
  getWhtComputation,
  getCitComputation,
  getStampDutiesComputation,
  getTaxComputationChart,
  getTaxAssumptions,
} from "../controllers/enterpriseTaxComputationController";
import { getTaxSummaryHandler } from "../controllers/enterpriseTaxSummaryController";
import { enterpriseValidations } from "../../middlewares/validations/enterpriseValidation";

const router = express.Router({ mergeParams: true });

router.get("/vat-computation/types", getVatTypes);
router.get("/vat-computation/periods", getVatPeriods);
router.get("/vat-computation/status", getVatStatus);
router.post("/vat-computation/initiate-setup", initiateVatSetup);
router.post(
  "/vat-computation/calculate",
  enterpriseValidations.validateCalculateVat,
  calculateVat,
);
router.get("/vat-computation/results", getVatResults);
router.get("/vat-computation/report/download", downloadVatReport);
router.post(
  "/vat-computation/submit-return",
  enterpriseValidations.validateSubmitVatReturn,
  submitVatReturn,
);
router.get("/tax-computation/vat-payable/monthly", getMonthlyVatPayable);
router.get("/tax-computation/vat-filing/12-month-stats", getVatFiling12MonthStats);
router.get("/tax-computation/cit-breakdown", getTaxBreakdown);
router.get("/tax-computation/vat", getVatComputation);
router.get("/tax-computation/paye", getPayeComputation);
router.get("/tax-computation/wht", getWhtComputation);
router.get("/tax-computation/cit", getCitComputation);
router.get("/tax-computation/stamp-duties", getStampDutiesComputation);
router.get("/tax-computation/threshold-status", getThresholdStatus);
router.get("/tax-computation/threshold-info", getThresholdInfo);
router.get("/tax-computation/chart", getTaxComputationChart);
router.get("/tax-computation/assumptions", getTaxAssumptions);
router.get("/tax-summary", getTaxSummaryHandler);

export default router;
