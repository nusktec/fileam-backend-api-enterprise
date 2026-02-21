import express from "express";
import {
  listPayments,
  getPaymentById,
} from "../controllers/paymentRecordsController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { validateIdParam } from "../../middlewares/validations/mobileValidation";
import { withPagination } from "../../middlewares/paginationMiddleware";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", withPagination("createdAt"), listPayments);
router.get("/:id", validateIdParam, getPaymentById);

export default router;
