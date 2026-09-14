import { Router } from "express";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  getGeneralLedger,
  getGeneralLedgerPdf,
  getLedgerDashboard,
  getTrialBalance,
  getTrialBalancePdf,
} from "../controllers/ledgerController";

const router = Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/dashboard", getLedgerDashboard);
router.get("/trial-balance", getTrialBalance);
router.get("/general-ledger", getGeneralLedger);
router.get("/trial-balance/pdf", getTrialBalancePdf);
router.get("/general-ledger/pdf", getGeneralLedgerPdf);

export default router;
