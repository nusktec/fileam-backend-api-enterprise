import express from "express";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  createPayer,
  createPayerDocument,
  createPayerTransaction,
  getPayer,
  listPayerDocuments,
  listPayerReceivables,
  listPayers,
  listPayerTransactions,
  recordPayerInvoicePayment,
  updatePayer,
} from "../controllers/payersController";
import {
  createPayerDocumentValidation,
  createPayerTransactionValidation,
  createPayerValidation,
  listPayerDocumentsValidation,
  listPayersValidation,
  listPayerTransactionsValidation,
  payerIdParamValidation,
  recordPayerInvoicePaymentValidation,
  updatePayerValidation,
} from "../../middlewares/validations/payerValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.post("/", express.json(), createPayerValidation, createPayer);
router.get("/", listPayersValidation, listPayers);
router.get("/:id", payerIdParamValidation, getPayer);
router.patch("/:id", express.json(), updatePayerValidation, updatePayer);
router.post(
  "/:id/transactions",
  express.json(),
  createPayerTransactionValidation,
  createPayerTransaction,
);
router.get(
  "/:id/transactions",
  listPayerTransactionsValidation,
  listPayerTransactions,
);
router.get(
  "/:id/receivables",
  payerIdParamValidation,
  listPayerReceivables,
);
router.post(
  "/:id/transactions/:transactionId/payments",
  express.json(),
  recordPayerInvoicePaymentValidation,
  recordPayerInvoicePayment,
);
router.post(
  "/:id/documents",
  express.json(),
  createPayerDocumentValidation,
  createPayerDocument,
);
router.get(
  "/:id/documents",
  listPayerDocumentsValidation,
  listPayerDocuments,
);

export default router;
