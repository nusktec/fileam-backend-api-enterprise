import express from "express";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  createEmployer,
  deleteEmployer,
  deleteEmployerDocument,
  getEmployer,
  getEmployerIncomeHistory,
  linkEmployerDocument,
  listEmployerDocuments,
  listEmployers,
  patchEmployerDocument,
  updateEmployer,
} from "../controllers/employersController";
import {
  createEmployerValidation,
  deleteEmployerDocumentValidation,
  employerIdParamValidation,
  linkEmployerDocumentValidation,
  listEmployerDocumentsValidation,
  listEmployersValidation,
  listIncomeHistoryValidation,
  patchEmployerDocumentValidation,
  updateEmployerValidation,
} from "../../middlewares/validations/employerValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.post("/", express.json(), createEmployerValidation, createEmployer);
router.get("/", listEmployersValidation, listEmployers);
router.get("/:id", employerIdParamValidation, getEmployer);
router.patch("/:id", express.json(), updateEmployerValidation, updateEmployer);
router.delete("/:id", employerIdParamValidation, deleteEmployer);
router.get(
  "/:id/income-history",
  listIncomeHistoryValidation,
  getEmployerIncomeHistory,
);
router.get(
  "/:id/documents",
  listEmployerDocumentsValidation,
  listEmployerDocuments,
);
router.post(
  "/:id/documents",
  express.json(),
  linkEmployerDocumentValidation,
  linkEmployerDocument,
);
router.patch(
  "/:id/documents/:documentId",
  express.json(),
  patchEmployerDocumentValidation,
  patchEmployerDocument,
);
router.delete(
  "/:id/documents/:documentId",
  deleteEmployerDocumentValidation,
  deleteEmployerDocument,
);

export default router;
