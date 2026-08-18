import express from "express";
import {
  createCustomer,
  updateCustomer,
  getCustomer,
  getCustomerDashboard,
  uploadCustomerDocument,
} from "../controllers/customersController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  createCustomerValidation,
  updateCustomerValidation,
  uploadCustomerDocumentValidation,
} from "../../middlewares/validations/directoryValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/dashboard", getCustomerDashboard);
router.post("/", express.json(), createCustomerValidation, createCustomer);
router.patch(
  "/:customerId",
  express.json(),
  updateCustomerValidation,
  updateCustomer,
);
router.get("/:customerId", getCustomer);
router.post(
  "/:customerId/documents",
  express.json(),
  uploadCustomerDocumentValidation,
  uploadCustomerDocument,
);

export default router;
