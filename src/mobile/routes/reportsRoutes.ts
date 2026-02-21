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
import { validateIdParam } from "../../middlewares/validations/mobileValidation";
import { withPagination } from "../../middlewares/paginationMiddleware";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/types", getReportTypes);
router.get("/periods", getReportPeriods);
router.post("/generate", express.json(), generateReport);
router.get("/", withPagination("generatedAt"), listReports);
router.get("/:id", validateIdParam, getReportById);
router.get("/:id/download", validateIdParam, getReportDownload);
router.get("/:id/vault-link", validateIdParam, getReportVaultLink);

export default router;
