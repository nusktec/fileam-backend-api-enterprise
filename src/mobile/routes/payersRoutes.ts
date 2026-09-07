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
  getPayerUndoCheck,
  undoPayer,
  getPayerTransactionUndoCheck,
  undoPayerTransaction,
} from "../controllers/payersController";
import {
  createPayerDocumentValidation,
  createPayerTransactionValidation,
  createPayerValidation,
  listPayerDocumentsValidation,
  listPayersValidation,
  listPayerTransactionsValidation,
  payerIdParamValidation,
  payerTransactionIdParamValidation,
  recordPayerInvoicePaymentValidation,
  updatePayerValidation,
} from "../../middlewares/validations/payerValidation";
import {
  payerTransactionUndoValidation,
  payerUndoValidation,
} from "../../middlewares/validations/recordUndoValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.post("/", express.json(), createPayerValidation, createPayer);
router.get("/", listPayersValidation, listPayers);
router.get("/:id", payerIdParamValidation, getPayer);
router.get("/:id/undo", payerIdParamValidation, getPayerUndoCheck);
router.post(
  "/:id/undo",
  payerIdParamValidation,
  express.json(),
  payerUndoValidation,
  undoPayer,
);
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
  "/:id/transactions/:transactionId/undo",
  payerTransactionIdParamValidation,
  getPayerTransactionUndoCheck,
);
router.post(
  "/:id/transactions/:transactionId/undo",
  payerTransactionIdParamValidation,
  express.json(),
  payerTransactionUndoValidation,
  undoPayerTransaction,
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
