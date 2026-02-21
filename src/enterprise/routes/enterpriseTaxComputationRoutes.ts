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
} from "../controllers/enterpriseTaxComputationController";

const router = express.Router({ mergeParams: true });

router.get("/vat-computation/types", getVatTypes);
router.get("/vat-computation/periods", getVatPeriods);
router.get("/vat-computation/status", getVatStatus);
router.post("/vat-computation/initiate-setup", initiateVatSetup);
router.post("/vat-computation/calculate", calculateVat);
router.get("/vat-computation/results", getVatResults);
router.get("/vat-computation/report/download", downloadVatReport);
router.post("/vat-computation/submit-return", submitVatReturn);
router.get("/tax-computation/vat-payable/monthly", getMonthlyVatPayable);
router.get("/tax-computation/threshold-status", getThresholdStatus);
router.get("/tax-computation/threshold-info", getThresholdInfo);

export default router;
