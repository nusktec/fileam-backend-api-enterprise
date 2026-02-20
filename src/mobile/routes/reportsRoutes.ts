import express from "express";
import {
  listReports,
  getReportById,
  getReportTypes,
  getReportPeriods,
  generateReport,
  getReportDownload,
  getReportVaultLink,
} from "../controllers/reportsController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/types", getReportTypes);
router.get("/periods", getReportPeriods);
router.post("/generate", express.json(), generateReport);
router.get("/", listReports);
router.get("/:id", getReportById);
router.get("/:id/download", getReportDownload);
router.get("/:id/vault-link", getReportVaultLink);

export default router;
