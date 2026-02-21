import express from "express";
import {
  getRecentTransactions,
  getAllTransactions,
  getSummary,
  getMonthlyCashFlow,
  addTransaction,
  getDocumentTypes,
  getCurrencies,
  uploadDocument,
  getDocumentStatus,
  getProcessingQueue,
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
router.get("/cash-flow/monthly", getMonthlyCashFlow);
router.post("/transactions", enterpriseValidations.validateAddTransaction, addTransaction);
router.post("/documents/upload", enterpriseValidations.validateUploadFinancialDocument, uploadDocument);
router.get("/documents/:documentId/status", enterpriseValidations.validateDocumentIdParam, getDocumentStatus);
router.get("/processing-queue", getProcessingQueue);
router.get("/invoices", withPagination("dateIssued"), listInvoices);
router.post("/invoices", enterpriseValidations.validateCreateInvoice, createInvoice);
router.get("/invoices/:invoiceId", enterpriseValidations.validateInvoiceIdParam, getInvoice);
router.put("/invoices/:invoiceId", enterpriseValidations.validateInvoiceIdParam, enterpriseValidations.validateUpdateInvoice, updateInvoice);
router.patch("/invoices/:invoiceId/mark-paid", enterpriseValidations.validateInvoiceIdParam, markInvoicePaid);
router.get("/invoices/:invoiceId/pdf", enterpriseValidations.validateInvoiceIdParam, getInvoicePdf);

export default router;
