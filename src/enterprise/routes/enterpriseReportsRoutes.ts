import express from "express";
import {
  listReportsHandler,
  exportAllReportsPdfHandler,
  getTaxesSummaryHandler,
  getVatPaymentReportHandler,
  getCitComputationReportHandler,
  getWhtReportHandler,
  getTaxWithholdingReportHandler,
  getPayeComputationReportHandler,
  getReportDownloadHandler,
} from "../controllers/enterpriseReportsController";

const router = express.Router({ mergeParams: true });

router.get("/", listReportsHandler);
router.get("/taxes-summary", getTaxesSummaryHandler);
router.get("/vat-payment", getVatPaymentReportHandler);
router.get("/cit", getCitComputationReportHandler);
router.get("/wht", getWhtReportHandler);
router.get("/tax-withholding", getTaxWithholdingReportHandler);
router.get("/paye", getPayeComputationReportHandler);
router.get("/export-all", exportAllReportsPdfHandler);
router.get("/:reportId/download", getReportDownloadHandler);

export default router;
