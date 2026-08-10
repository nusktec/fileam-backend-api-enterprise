import express from "express";
import {
  listDocuments,
  getDocumentById,
  getDocumentDownload,
  createDocument,
  listRecordsByCategory,
} from "../controllers/evidenceVaultController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { validateIdParam } from "../../middlewares/validations/mobileValidation";
import { createEvidenceVaultDocumentValidation } from "../../middlewares/validations/evidenceVaultValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/documents", listDocuments);
router.post(
  "/documents",
  createEvidenceVaultDocumentValidation,
  createDocument,
);
router.get("/documents/:id", validateIdParam, getDocumentById);
router.get("/documents/:id/download", validateIdParam, getDocumentDownload);
router.get("/records/:category", listRecordsByCategory);

export default router;
