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
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

// VAT (must be before /:id)
router.get("/vat/calculation", getVatCalculation);
router.post("/vat/draft", express.json(), createOrUpdateVatDraft);
router.post("/vat/submit", express.json(), submitVatFiling);

// WHT (must be before /:id)
router.get("/wht/schedule", getWhtSchedule);
router.post("/wht/draft", express.json(), createOrUpdateWhtDraft);
router.post("/wht/submit", express.json(), submitWhtFiling);

// Filings list and detail
router.get("/", listFilings);
router.get("/:id", getFilingById);
router.get("/:id/document", getFilingDocument);
router.get("/:id/vault-link", getFilingVaultLink);

export default router;
