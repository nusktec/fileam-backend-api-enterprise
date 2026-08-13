import express from "express";
import {
  createRegisteredLiability,
  listRegisteredLiabilities,
  getRegisteredLiability,
  createLiabilityRepayment,
  listLiabilityRepayments,
  listAllLiabilityRepayments,
  getLiabilityRepayment,
} from "../controllers/liabilityRepaymentController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  createRegisteredLiabilityValidation,
  createLiabilityRepaymentValidation,
} from "../../middlewares/validations/liabilityRepaymentValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

/**
 * Static /repayments paths MUST be registered before /:liabilityId
 * or GET /repayments is captured as liabilityId="repayments".
 */
router.get("/repayments", listAllLiabilityRepayments);
router.get("/repayments/:repaymentId", getLiabilityRepayment);

/** Nested repayment history for one liability. */
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
