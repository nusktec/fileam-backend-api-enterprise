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

const router = express.Router({ mergeParams: true });

router.get("/document-types", getDocumentTypes);
router.get("/currencies", getCurrencies);
router.get("/transactions/recent", getRecentTransactions);
router.get("/transactions", getAllTransactions);
router.get("/summary", getSummary);
router.get("/cash-flow/monthly", getMonthlyCashFlow);
router.post("/transactions", addTransaction);
router.post("/documents/upload", uploadDocument);
router.get("/documents/:documentId/status", getDocumentStatus);
router.get("/processing-queue", getProcessingQueue);
router.get("/invoices", listInvoices);
router.post("/invoices", createInvoice);
router.get("/invoices/:invoiceId", getInvoice);
router.put("/invoices/:invoiceId", updateInvoice);
router.patch("/invoices/:invoiceId/mark-paid", markInvoicePaid);
router.get("/invoices/:invoiceId/pdf", getInvoicePdf);

export default router;
