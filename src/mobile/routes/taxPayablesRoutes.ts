import express from "express";
import {
  listPayables,
  getPayableById,
  initiatePayment,
} from "../controllers/taxPayablesController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { validateIdParam } from "../../middlewares/validations/mobileValidation";
import { withPagination } from "../../middlewares/paginationMiddleware";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", withPagination(), listPayables);
router.get("/:id", validateIdParam, getPayableById);
router.post(
  "/:id/initiate-payment",
  validateIdParam,
  express.json(),
  initiatePayment,
);

export default router;
