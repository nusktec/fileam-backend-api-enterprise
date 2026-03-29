import express from "express";
import {
  getStats,
  getCategories,
  getRecentDocuments,
  getStorageUsage,
  listDocuments,
  getDocument,
  deleteDocument,
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
  getInvoiceExtractionPreview,
  convertToInvoice,
} from "../controllers/enterpriseEvidenceVaultController";
import { enterpriseValidations } from "../../middlewares/validations/enterpriseValidation";
import { withPagination } from "../../middlewares/paginationMiddleware";

const router = express.Router({ mergeParams: true });

router.get("/stats", getStats);
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
router.delete(
  "/documents/:documentId",
  enterpriseValidations.validateDocumentIdParam,
  deleteDocument,
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
router.get(
  "/documents/:documentId/invoice-extraction-preview",
  enterpriseValidations.validateDocumentIdParam,
  getInvoiceExtractionPreview,
);
router.post(
  "/documents/:documentId/convert-to-invoice",
  enterpriseValidations.validateDocumentIdParam,
  enterpriseValidations.validateConvertToInvoice,
  convertToInvoice,
);

export default router;
