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
import {
  getPitCalculation,
  submitPitFiling,
  savePitDraft,
} from "../controllers/pitFilingController";
import {
  getCitCalculation,
  submitCitFiling,
  saveCitDraft,
} from "../controllers/citFilingController";
import { getMobileTaxFilingConstants } from "../controllers/taxFilingConstantsController";
import {
  getUnifiedTaxFilingPreview,
  saveUnifiedTaxFilingDraft,
  submitUnifiedTaxFiling,
} from "../controllers/unifiedTaxFilingController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  validateIdParam,
  validateClientUserIdParam,
} from "../../middlewares/validations/mobileValidation";
import { submitConsultantTaxFilingForClient } from "../controllers/consultantTaxFilingController";
import {
  getFilingWorkspace,
  updateFilingWorkspace,
  confirmFilingComputation,
  validateFilingWorkspace,
  generateFilingDocuments,
  getFilingWorkspaceDocument,
  getFilingWorkspacePackage,
  completeFiling,
} from "../controllers/filingWorkspaceController";
import { withPagination } from "../../middlewares/paginationMiddleware";
import {
  validatePitCalculationQuery,
  validatePitSubmitBody,
} from "../../middlewares/validations/pitFilingValidation";
import {
  validateCitCalculationQuery,
  validateCitSubmitBody,
} from "../../middlewares/validations/citFilingValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/constants", getMobileTaxFilingConstants);

// Unified by tax type (active codes from constants.taxTypes; must be before /:id)
router.get("/tax/:taxType/preview", getUnifiedTaxFilingPreview);
router.post("/tax/:taxType/draft", express.json(), saveUnifiedTaxFilingDraft);
router.post("/tax/:taxType/submit", express.json(), submitUnifiedTaxFiling);

// Consultant submits on behalf of linked client (before /:id)
router.post(
  "/consultant/clients/:clientUserId/tax/:taxType/submit",
  validateClientUserIdParam,
  express.json(),
  submitConsultantTaxFilingForClient,
);

const WORKSPACE_TAX_PARAM = ":taxType(vat|wht|pit|cit)";

// Workspace (must be before /:id; taxType constrained so filing UUIDs are not captured)
router.get(`/${WORKSPACE_TAX_PARAM}/workspace`, getFilingWorkspace);
router.put(`/${WORKSPACE_TAX_PARAM}/workspace`, express.json(), updateFilingWorkspace);
router.post(
  `/${WORKSPACE_TAX_PARAM}/workspace/confirm-computation`,
  express.json(),
  confirmFilingComputation,
);
router.post(
  `/${WORKSPACE_TAX_PARAM}/workspace/validate`,
  express.json(),
  validateFilingWorkspace,
);
router.post(
  `/${WORKSPACE_TAX_PARAM}/workspace/generate-documents`,
  express.json(),
  generateFilingDocuments,
);
router.get(
  `/${WORKSPACE_TAX_PARAM}/workspace/documents/:documentId`,
  getFilingWorkspaceDocument,
);
router.get(`/${WORKSPACE_TAX_PARAM}/workspace/package`, getFilingWorkspacePackage);

// VAT (must be before /:id)
router.get("/vat/calculation", getVatCalculation);
router.post("/vat/draft", express.json(), createOrUpdateVatDraft);
router.post("/vat/submit", express.json(), submitVatFiling);

// WHT (must be before /:id)
router.get("/wht/schedule", getWhtSchedule);
router.post("/wht/draft", express.json(), createOrUpdateWhtDraft);
router.post("/wht/submit", express.json(), submitWhtFiling);

// PIT (must be before /:id)
router.get("/pit/calculation", validatePitCalculationQuery, getPitCalculation);
router.post("/pit/draft", express.json(), savePitDraft);
router.post("/pit/submit", express.json(), validatePitSubmitBody, submitPitFiling);

// CIT (must be before /:id)
router.get("/cit/calculation", validateCitCalculationQuery, getCitCalculation);
router.post("/cit/draft", express.json(), saveCitDraft);
router.post("/cit/submit", express.json(), validateCitSubmitBody, submitCitFiling);

// Filings list and detail
router.get("/", withPagination(), listFilings);
router.post("/:id/complete", validateIdParam, express.json(), completeFiling);
router.get("/:id", validateIdParam, getFilingById);
router.get("/:id/document", validateIdParam, getFilingDocument);
router.get("/:id/vault-link", validateIdParam, getFilingVaultLink);

export default router;
