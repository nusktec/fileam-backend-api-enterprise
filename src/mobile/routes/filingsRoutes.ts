import express from "express";
import {
  listFilings,
  getFilingById,
  getFilingDocument,
  getFilingVaultLink,
} from "../controllers/filingsController";
import {
  getVatCalculation,
  createOrUpdateVatDraft,
  submitVatFiling,
} from "../controllers/vatFilingController";
import {
  getWhtSchedule,
  createOrUpdateWhtDraft,
  submitWhtFiling,
} from "../controllers/whtFilingController";
import { getMobileTaxFilingConstants } from "../controllers/taxFilingConstantsController";
import {
  getUnifiedTaxFilingPreview,
  saveUnifiedTaxFilingDraft,
  submitUnifiedTaxFiling,
} from "../controllers/unifiedTaxFilingController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { validateIdParam } from "../../middlewares/validations/mobileValidation";
import { withPagination } from "../../middlewares/paginationMiddleware";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/constants", getMobileTaxFilingConstants);

// Unified by tax type (active codes from constants.taxTypes; must be before /:id)
router.get("/tax/:taxType/preview", getUnifiedTaxFilingPreview);
router.post("/tax/:taxType/draft", express.json(), saveUnifiedTaxFilingDraft);
router.post("/tax/:taxType/submit", express.json(), submitUnifiedTaxFiling);

// VAT (must be before /:id)
router.get("/vat/calculation", getVatCalculation);
router.post("/vat/draft", express.json(), createOrUpdateVatDraft);
router.post("/vat/submit", express.json(), submitVatFiling);

// WHT (must be before /:id)
router.get("/wht/schedule", getWhtSchedule);
router.post("/wht/draft", express.json(), createOrUpdateWhtDraft);
router.post("/wht/submit", express.json(), submitWhtFiling);

// Filings list and detail
router.get("/", withPagination(), listFilings);
router.get("/:id", validateIdParam, getFilingById);
router.get("/:id/document", validateIdParam, getFilingDocument);
router.get("/:id/vault-link", validateIdParam, getFilingVaultLink);

export default router;
