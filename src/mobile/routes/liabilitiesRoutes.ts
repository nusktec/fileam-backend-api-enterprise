import express from "express";
import {
  createRegisteredLiability,
  listRegisteredLiabilities,
  getRegisteredLiability,
  createLiabilityRepayment,
  listLiabilityRepayments,
} from "../controllers/liabilityRepaymentController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  createRegisteredLiabilityValidation,
  createLiabilityRepaymentValidation,
} from "../../middlewares/validations/liabilityRepaymentValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

/** Nested repayment history (before GET /:liabilityId). */
router.post(
  "/:liabilityId/repayments",
  express.json(),
  createLiabilityRepaymentValidation,
  createLiabilityRepayment,
);
router.get("/:liabilityId/repayments", listLiabilityRepayments);

/** Liability register. */
router.post(
  "/",
  express.json(),
  createRegisteredLiabilityValidation,
  createRegisteredLiability,
);
router.get("/", listRegisteredLiabilities);
router.get("/:liabilityId", getRegisteredLiability);

export default router;
