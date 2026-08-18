import express from "express";
import {
  createSupplier,
  updateSupplier,
  getSupplier,
  getSupplierDashboard,
  uploadSupplierDocument,
} from "../controllers/suppliersController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  createSupplierValidation,
  updateSupplierValidation,
  uploadSupplierDocumentValidation,
} from "../../middlewares/validations/directoryValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/dashboard", getSupplierDashboard);
router.post("/", express.json(), createSupplierValidation, createSupplier);
router.patch(
  "/:supplierId",
  express.json(),
  updateSupplierValidation,
  updateSupplier,
);
router.get("/:supplierId", getSupplier);
router.post(
  "/:supplierId/documents",
  express.json(),
  uploadSupplierDocumentValidation,
  uploadSupplierDocument,
);

export default router;
