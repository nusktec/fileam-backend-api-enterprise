import express from "express";
import {
  getUnfiledItemsHandler,
  listFilingsHandler,
  createFilingHandler,
  getFilingReportHandler,
  getFilingsSummaryHandler,
  getVatReturnsHandler,
} from "../controllers/enterpriseFilingsController";
import { enterpriseValidations } from "../../middlewares/validations/enterpriseValidation";

const router = express.Router({ mergeParams: true });

router.get("/summary", getFilingsSummaryHandler);
router.get("/vat-returns", getVatReturnsHandler);
router.get("/unfiled", getUnfiledItemsHandler);
router.get("/", listFilingsHandler);
router.post(
  "/",
  ...enterpriseValidations.validateCreateFiling,
  createFilingHandler,
);
router.get(
  "/:filingId/report",
  ...enterpriseValidations.validateFilingIdParam,
  getFilingReportHandler,
);

export default router;
