import express from "express";
import {
  listDocuments,
  getDocumentById,
  getDocumentDownload,
} from "../controllers/evidenceVaultController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { validateIdParam } from "../../middlewares/validations/mobileValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/documents", listDocuments);
router.get("/documents/:id", validateIdParam, getDocumentById);
router.get("/documents/:id/download", validateIdParam, getDocumentDownload);

export default router;
