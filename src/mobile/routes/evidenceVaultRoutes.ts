import express from "express";
import {
  listDocuments,
  getDocumentById,
  getDocumentDownload,
} from "../controllers/evidenceVaultController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/documents", listDocuments);
router.get("/documents/:id", getDocumentById);
router.get("/documents/:id/download", getDocumentDownload);

export default router;
