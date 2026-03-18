import express from "express";
import {
  getRecentTransactions,
  getAllTransactions,
  getSummary,
  getProfitTrend,
  getExpenseBreakdown,
  getProfitAndLoss,
  getBalanceSheet,
  getMonthlyCashFlow,
  addTransaction,
  getDocumentTypes,
  getCurrencies,
  uploadDocument,
  uploadInvoiceDocument,
  ocrExtractDocument,
  vendorIdentifyDocument,
  analyzeDocument,
  getDocumentReview,
  deleteDocument,
  getDocumentStatus,
  getProcessingQueue,
  getFinancialDocumentStats,
  listFinancialDocuments,
  getFinancialDocument,
  getInvoice,
  updateInvoice,
  markInvoicePaid,
  getInvoicePdf,
  listInvoices,
  createInvoice,
} from "../controllers/enterpriseFinancialsController";
import { enterpriseValidations } from "../../middlewares/validations/enterpriseValidation";
import { withPagination } from "../../middlewares/paginationMiddleware";

const router = express.Router({ mergeParams: true });

router.get("/document-types", getDocumentTypes);
router.get("/currencies", getCurrencies);
router.get("/transactions/recent", getRecentTransactions);
router.get("/transactions", withPagination("date"), getAllTransactions);
router.get("/summary", getSummary);
router.get("/profit-loss", getProfitAndLoss);
router.get("/balance-sheet", getBalanceSheet);
router.get("/profit-analysis/trend", getProfitTrend);
router.get("/profit-analysis/expense-breakdown", getExpenseBreakdown);
router.get("/profitability/trends", getProfitTrend);
router.get("/profitability/expense-breakdown", getExpenseBreakdown);
router.get("/cash-flow/monthly", getMonthlyCashFlow);
router.post(
  "/transactions",
  enterpriseValidations.validateAddTransaction,
  addTransaction,
);
router.get("/documents/stats", getFinancialDocumentStats);
router.get(
  "/documents",
  withPagination("documentDate"),
  listFinancialDocuments,
);
router.get(
  "/documents/:documentId",
  enterpriseValidations.validateDocumentIdParam,
  getFinancialDocument,
);
router.get(
  "/documents/:documentId/status",
  enterpriseValidations.validateDocumentIdParam,
  getDocumentStatus,
);
router.post(
  "/documents/upload",
  enterpriseValidations.validateUploadFinancialDocument,
  uploadDocument,
);
router.post("/documents/upload-invoice", uploadInvoiceDocument);
router.post(
  "/documents/:fileId/ocr-extract",
  enterpriseValidations.validateFileIdParam,
  ocrExtractDocument,
);
router.post(
  "/documents/extractions/:extractionId/vendor-identify",
  vendorIdentifyDocument,
);
router.post("/documents/vendors/:vendorId/analyze", analyzeDocument);
router.get(
  "/documents/:documentId/review",
  enterpriseValidations.validateDocumentIdParam,
  getDocumentReview,
);
router.delete(
  "/documents/:documentId",
  enterpriseValidations.validateDocumentIdParam,
  deleteDocument,
);
router.get("/processing-queue", getProcessingQueue);
router.get("/invoices", withPagination("dateIssued"), listInvoices);
router.post(
  "/invoices",
  enterpriseValidations.validateCreateInvoice,
  createInvoice,
);
router.get(
  "/invoices/:invoiceId",
  enterpriseValidations.validateInvoiceIdParam,
  getInvoice,
);
router.put(
  "/invoices/:invoiceId",
  enterpriseValidations.validateInvoiceIdParam,
  enterpriseValidations.validateUpdateInvoice,
  updateInvoice,
);
router.patch(
  "/invoices/:invoiceId/mark-paid",
  enterpriseValidations.validateInvoiceIdParam,
  markInvoicePaid,
);
router.get(
  "/invoices/:invoiceId/pdf",
  enterpriseValidations.validateInvoiceIdParam,
  getInvoicePdf,
);

export default router;
