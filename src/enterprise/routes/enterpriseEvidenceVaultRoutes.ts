import express from "express";
import {
  getCategories,
  getRecentDocuments,
  getStorageUsage,
  listDocuments,
  getDocument,
  getApprovers,
  approveDocument,
  rejectDocument,
  getDocumentDownload,
  updateDocumentDetails,
  getSignatureReport,
  getDocumentOriginal,
  getDocumentCategories,
  getDocumentStatuses,
  uploadDocument,
  getDocumentPreview,
  signDocument,
} from "../controllers/enterpriseEvidenceVaultController";

const router = express.Router({ mergeParams: true });

router.get("/categories", getCategories);
router.get("/documents/recent", getRecentDocuments);
router.get("/storage-usage", getStorageUsage);
router.get("/documents", listDocuments);
router.get("/document-categories", getDocumentCategories);
router.get("/document-statuses", getDocumentStatuses);
router.get("/approvers", getApprovers);
router.post("/documents/upload", uploadDocument);
router.get("/documents/:documentId", getDocument);
router.get("/documents/:documentId/download", getDocumentDownload);
router.put("/documents/:documentId", updateDocumentDetails);
router.put("/documents/:documentId/details", updateDocumentDetails);
router.post("/documents/:documentId/approve", approveDocument);
router.post("/documents/:documentId/reject", rejectDocument);
router.get("/documents/:documentId/signature-report", getSignatureReport);
router.get("/documents/:documentId/original-file", getDocumentOriginal);
router.get("/documents/:documentId/preview", getDocumentPreview);
router.post("/documents/:documentId/sign", signDocument);

export default router;
