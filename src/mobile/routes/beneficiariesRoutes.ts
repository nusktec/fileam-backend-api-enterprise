import express from "express";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  createBeneficiary,
  createBeneficiaryDocument,
  createBeneficiaryTransaction,
  getBeneficiary,
  listBeneficiaries,
  remitBeneficiaryWht,
  updateBeneficiary,
  getBeneficiaryUndoCheck,
  undoBeneficiary,
  getBeneficiaryTransactionUndoCheck,
  undoBeneficiaryTransaction,
} from "../controllers/beneficiariesController";
import {
  beneficiaryIdParamValidation,
  beneficiaryTransactionIdParamValidation,
  createBeneficiaryDocumentValidation,
  createBeneficiaryTransactionValidation,
  createBeneficiaryValidation,
  listBeneficiariesValidation,
  remitBeneficiaryWhtValidation,
  updateBeneficiaryValidation,
} from "../../middlewares/validations/beneficiaryValidation";
import {
  beneficiaryTransactionUndoValidation,
  beneficiaryUndoValidation,
} from "../../middlewares/validations/recordUndoValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", listBeneficiariesValidation, listBeneficiaries);
router.post("/", express.json(), createBeneficiaryValidation, createBeneficiary);
router.get("/:id", beneficiaryIdParamValidation, getBeneficiary);
router.get("/:id/undo", beneficiaryIdParamValidation, getBeneficiaryUndoCheck);
router.post(
  "/:id/undo",
  beneficiaryIdParamValidation,
  express.json(),
  beneficiaryUndoValidation,
  undoBeneficiary,
);
router.patch(
  "/:id",
  express.json(),
  updateBeneficiaryValidation,
  updateBeneficiary,
);
router.post(
  "/:id/transactions",
  express.json(),
  createBeneficiaryTransactionValidation,
  createBeneficiaryTransaction,
);
router.get(
  "/:id/transactions/:transactionId/undo",
  beneficiaryTransactionIdParamValidation,
  getBeneficiaryTransactionUndoCheck,
);
router.post(
  "/:id/transactions/:transactionId/undo",
  beneficiaryTransactionIdParamValidation,
  express.json(),
  beneficiaryTransactionUndoValidation,
  undoBeneficiaryTransaction,
);
router.post(
  "/:id/transactions/:transactionId/remit",
  express.json(),
  remitBeneficiaryWhtValidation,
  remitBeneficiaryWht,
);
router.post(
  "/:id/documents",
  express.json(),
  createBeneficiaryDocumentValidation,
  createBeneficiaryDocument,
);

export default router;
