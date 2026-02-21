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
import { enterpriseValidations } from "../../middlewares/validations/enterpriseValidation";
import { withPagination } from "../../middlewares/paginationMiddleware";

const router = express.Router({ mergeParams: true });

router.get("/categories", getCategories);
router.get("/documents/recent", getRecentDocuments);
router.get("/storage-usage", getStorageUsage);
router.get("/documents", withPagination("documentDate"), listDocuments);
router.get("/document-categories", getDocumentCategories);
router.get("/document-statuses", getDocumentStatuses);
router.get("/approvers", getApprovers);
router.post(
  "/documents/upload",
  enterpriseValidations.validateUploadEvidenceDocument,
  uploadDocument,
);
router.get(
  "/documents/:documentId",
  enterpriseValidations.validateDocumentIdParam,
  getDocument,
);
router.get(
  "/documents/:documentId/download",
  enterpriseValidations.validateDocumentIdParam,
  getDocumentDownload,
);
router.put(
  "/documents/:documentId",
  enterpriseValidations.validateDocumentIdParam,
  enterpriseValidations.validateUpdateDocumentDetails,
  updateDocumentDetails,
);
router.put(
  "/documents/:documentId/details",
  enterpriseValidations.validateDocumentIdParam,
  enterpriseValidations.validateUpdateDocumentDetails,
  updateDocumentDetails,
);
router.post(
  "/documents/:documentId/approve",
  enterpriseValidations.validateDocumentIdParam,
  enterpriseValidations.validateApproveDocument,
  approveDocument,
);
router.post(
  "/documents/:documentId/reject",
  enterpriseValidations.validateDocumentIdParam,
  enterpriseValidations.validateRejectDocument,
  rejectDocument,
);
router.get(
  "/documents/:documentId/signature-report",
  enterpriseValidations.validateDocumentIdParam,
  getSignatureReport,
);
router.get(
  "/documents/:documentId/original-file",
  enterpriseValidations.validateDocumentIdParam,
  getDocumentOriginal,
);
router.get(
  "/documents/:documentId/preview",
  enterpriseValidations.validateDocumentIdParam,
  getDocumentPreview,
);
router.post(
  "/documents/:documentId/sign",
  enterpriseValidations.validateDocumentIdParam,
  enterpriseValidations.validateSignDocument,
  signDocument,
);

export default router;
