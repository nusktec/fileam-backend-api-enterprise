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

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", listBeneficiariesValidation, listBeneficiaries);
router.post("/", express.json(), createBeneficiaryValidation, createBeneficiary);
router.get("/:id", beneficiaryIdParamValidation, getBeneficiary);
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
