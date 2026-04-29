import express from "express";
import {
  getUnfiledItemsHandler,
  listFilingsHandler,
  createFilingHandler,
  getFilingReportHandler,
  getFilingByIdHandler,
  getFilingsSummaryHandler,
  getVatReturnsHandler,
  getTaxReturnsHandler,
  getFilingsConstantsHandler,
  submitClientVatReturnHandler,
  submitClientWhtReturnHandler,
  submitClientCitReturnHandler,
  submitClientPayeReturnHandler,
  submitClientPitReturnHandler,
  listFilingTaxTypesHandler,
  updateFilingTaxTypesHandler,
} from "../controllers/enterpriseFilingsController";
import { enterpriseValidations } from "../../middlewares/validations/enterpriseValidation";

const router = express.Router({ mergeParams: true });

router.get("/summary", getFilingsSummaryHandler);
router.get("/vat-returns", getVatReturnsHandler);
router.get("/unfiled", getUnfiledItemsHandler);
router.get("/tax-types", listFilingTaxTypesHandler);
router.put(
  "/tax-types",
  express.json(),
  ...enterpriseValidations.validateUpdateFilingTaxTypes,
  updateFilingTaxTypesHandler,
);
router.get("/constants", getFilingsConstantsHandler);
router.get("/returns", getTaxReturnsHandler);
// Before GET "/" so paths like /:filingId/report are not swallowed by less-specific handlers on some stacks.
router.get(
  "/:filingId/report",
  ...enterpriseValidations.validateFilingIdParam,
  getFilingReportHandler,
);
router.get(
  "/:filingId",
  ...enterpriseValidations.validateFilingIdParam,
  getFilingByIdHandler,
);
router.get("/", listFilingsHandler);
router.post(
  "/vat/submit-return",
  ...enterpriseValidations.validateSubmitVatFiling,
  submitClientVatReturnHandler,
);
router.post(
  "/wht/submit-return",
  ...enterpriseValidations.validateSubmitVatFiling,
  submitClientWhtReturnHandler,
);
router.post(
  "/cit/submit-return",
  ...enterpriseValidations.validateSubmitVatFiling,
  submitClientCitReturnHandler,
);
router.post(
  "/paye/submit-return",
  ...enterpriseValidations.validateSubmitVatFiling,
  submitClientPayeReturnHandler,
);
router.post(
  "/pit/submit-return",
  ...enterpriseValidations.validateSubmitVatFiling,
  submitClientPitReturnHandler,
);
router.post(
  "/",
  ...enterpriseValidations.validateCreateFiling,
  createFilingHandler,
);

export default router;
