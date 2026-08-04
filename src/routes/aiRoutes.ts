import express from "express";
import { aiServiceAuth } from "../middlewares/aiServiceAuth";
import { getRecords, updateRecord } from "../controllers/aiRecordsController";
import {
  downloadEvidenceVaultDocument,
  getEvidenceVaultDocument,
  listEvidenceVaultDocuments,
} from "../controllers/aiEvidenceVaultController";

const router = express.Router();

router.use(aiServiceAuth);

router.get("/records", getRecords);
router.patch("/records", updateRecord);

router.get("/evidence-vault/documents", listEvidenceVaultDocuments);
router.get("/evidence-vault/documents/:id", getEvidenceVaultDocument);
router.get(
  "/evidence-vault/documents/:id/download",
  downloadEvidenceVaultDocument,
);

export default router;
