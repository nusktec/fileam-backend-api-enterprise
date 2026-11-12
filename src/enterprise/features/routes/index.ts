import express from "express";
import { authenticate } from "../../../middlewares/auth/authMiddleware";
import { requireEnterpriseOnboardingComplete } from "../../middlewares/requireEnterpriseOnboardingComplete";
import { resolveClientQuery } from "../middlewares/resolveClientQuery";
import {
  getLedger,
  getLedgerAccountEntries,
} from "../controllers/ledgerController";
import {
  getSyncStatus,
  getSyncActivity,
  getSyncConflicts,
  postSyncPull,
} from "../controllers/syncController";
import {
  listTransactions,
  patchTransactionStage,
} from "../controllers/transactionsController";
import {
  listAuditTrail,
  reviewAuditTrail,
  flagAuditTrail,
} from "../controllers/auditTrailController";
import { getHealthScore } from "../controllers/healthScoreController";
import { getTaxOptimizerSnapshot } from "../controllers/taxOptimizerController";
import {
  startTaxOptimize,
  pollTaxOptimize,
} from "../controllers/taxOptimizeJobController";
import {
  listSessions,
  revokeSession,
} from "../controllers/sessionsController";
import { patchTaxAssumptions } from "../controllers/taxAssumptionsController";

const router = express.Router();

const auth = [authenticate(), requireEnterpriseOnboardingComplete] as const;
const withClient = [...auth, resolveClientQuery] as const;

/** General Ledger */
router.get("/ledger", ...withClient, getLedger);
router.get(
  "/ledger/accounts/:code/entries",
  ...withClient,
  getLedgerAccountEntries,
);

/** Mobile → Enterprise Sync */
router.get("/sync/status", ...withClient, getSyncStatus);
router.get("/sync/activity", ...withClient, getSyncActivity);
router.get("/sync/conflicts", ...withClient, getSyncConflicts);
router.post("/sync/pull", ...withClient, postSyncPull);

/** Transaction pipeline */
router.get("/transactions", ...withClient, listTransactions);
router.patch(
  "/transactions/:id/stage",
  ...withClient,
  patchTransactionStage,
);

/** Audit trail (clientId optional) */
router.get("/audit-trail", ...auth, listAuditTrail);
router.patch("/audit-trail/:id/review", ...auth, reviewAuditTrail);
router.patch("/audit-trail/:id/flag", ...auth, flagAuditTrail);

/** Business health score */
router.get("/health-score", ...withClient, getHealthScore);

/** Tax optimizer snapshot + analysis job */
router.get("/tax-optimizer/snapshot", ...withClient, getTaxOptimizerSnapshot);
router.post("/tax-optimizer/start", ...withClient, startTaxOptimize);
router.get("/tax-optimizer/poll", ...withClient, pollTaxOptimize);

/** Tax assumptions (partial update) */
router.patch(
  "/tax-computation/:clientId/assumptions",
  ...auth,
  patchTaxAssumptions,
);

/** Active sessions under /auth */
router.get("/auth/sessions", authenticate(), listSessions);
router.delete("/auth/sessions/:id", authenticate(), revokeSession);

export default router;
