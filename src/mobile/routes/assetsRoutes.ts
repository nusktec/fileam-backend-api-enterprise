import express from "express";
import {
  getAssetsSummary,
  createAsset,
  updateAsset,
  listAssets,
  getAssetById,
  getAssetsDashboard,
  getCurrentAssets,
  getNonCurrentAssets,
  getDepreciationAmortization,
  createAssetTransfer,
  listAssetTransfers,
  updateAssetTransfer,
  approveAssetTransfer,
  rejectAssetTransfer,
  createAssetSale,
  listAssetSales,
  createAssetDisposal,
  listAssetDisposals,
  updateAssetDisposal,
} from "../controllers/assetsController";
import {
  listAssetReviews,
  getAssetReview,
  uploadAssetEvidence,
  assignAssetConsultant,
  confirmAssetReview,
  approveAssetReview,
  listAssetReviewConsultants,
  listAllAssetHistory,
  downloadAssetReport,
} from "../controllers/assetReviewsController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { withPagination } from "../../middlewares/paginationMiddleware";
import { validateIdParam } from "../../middlewares/validations/mobileValidation";
import {
  validateCreateAsset,
  validateUpdateAsset,
  validateCreateTransfer,
  validateUpdateTransfer,
  validateCreateSale,
  validateCreateDisposal,
  validateUpdateDisposal,
} from "../../middlewares/validations/assetsValidation";
import {
  uploadMultiple,
  handleUploadError,
} from "../../middlewares/uploadMiddleware";
import {
  createCashBalance,
  createBankAccount,
} from "../controllers/cashBankController";
import { listUnitsOfProductionEligible } from "../controllers/unitAttributionController";
import {
  createCashValidation,
  createBankAccountValidation,
} from "../../middlewares/validations/cashBankValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/summary", getAssetsSummary);
router.get("/dashboard", getAssetsDashboard);
router.get("/current-assets", getCurrentAssets);
router.get("/non-current-assets", getNonCurrentAssets);
router.get("/depreciation-amortization", getDepreciationAmortization);
router.get("/units-of-production-eligible", listUnitsOfProductionEligible);

router.post(
  "/cash",
  express.json(),
  createCashValidation,
  createCashBalance,
);
router.post(
  "/bank-accounts",
  express.json(),
  createBankAccountValidation,
  createBankAccount,
);

/** Asset Reviews & reports (static paths before /:id) */
router.get("/reviews", withPagination(), listAssetReviews);
router.get("/reviews/:id", validateIdParam, getAssetReview);
router.get("/history", withPagination(), listAllAssetHistory);
router.get("/reports/:reportType", downloadAssetReport);
router.get("/consultants", listAssetReviewConsultants);

router.post("/", express.json(), validateCreateAsset, createAsset);
router.get("/", withPagination(), listAssets);

router.post(
  "/transfers",
  express.json(),
  validateCreateTransfer,
  createAssetTransfer,
);
router.get("/transfers", withPagination(), listAssetTransfers);
router.patch(
  "/transfers/:id",
  validateIdParam,
  express.json(),
  validateUpdateTransfer,
  updateAssetTransfer,
);
router.post(
  "/transfers/:id/approve",
  validateIdParam,
  approveAssetTransfer,
);
router.post(
  "/transfers/:id/reject",
  validateIdParam,
  rejectAssetTransfer,
);

router.post("/sales", express.json(), validateCreateSale, createAssetSale);
router.get("/sales", withPagination(), listAssetSales);

router.post(
  "/disposals",
  express.json(),
  validateCreateDisposal,
  createAssetDisposal,
);
router.get("/disposals", withPagination(), listAssetDisposals);
router.patch(
  "/disposals/:id",
  validateIdParam,
  express.json(),
  validateUpdateDisposal,
  updateAssetDisposal,
);

router.post(
  "/:id/evidence",
  validateIdParam,
  (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    uploadMultiple(req, res, (err) => {
      if (err) return handleUploadError(err, req, res, next);
      next();
    });
  },
  uploadAssetEvidence,
);
router.post(
  "/:id/assign-consultant",
  validateIdParam,
  express.json(),
  assignAssetConsultant,
);
router.post("/:id/confirm-review", validateIdParam, confirmAssetReview);
router.post("/:id/approve-review", validateIdParam, approveAssetReview);

router.patch(
  "/:id",
  validateIdParam,
  express.json(),
  validateUpdateAsset,
  updateAsset,
);
router.get("/:id", validateIdParam, getAssetById);

export default router;
