import express from "express";
import {
  createRegisteredLiability,
  listRegisteredLiabilities,
  getRegisteredLiability,
  createLiabilityRepayment,
  listLiabilityRepayments,
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

/** Repayment routes first (static paths before :liabilityId). */
router.post(
  "/repayments",
  express.json(),
  createLiabilityRepaymentValidation,
  createLiabilityRepayment,
);
router.get("/repayments", listLiabilityRepayments);
router.get("/repayments/:repaymentId", getLiabilityRepayment);

/** Liability register (source of truth for repayments). */
router.post(
  "/",
  express.json(),
  createRegisteredLiabilityValidation,
  createRegisteredLiability,
);
router.get("/", listRegisteredLiabilities);
router.get("/:liabilityId", getRegisteredLiability);

export default router;
