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

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/summary", getAssetsSummary);
router.get("/dashboard", getAssetsDashboard);
router.get("/current-assets", getCurrentAssets);
router.get("/non-current-assets", getNonCurrentAssets);
router.get("/depreciation-amortization", getDepreciationAmortization);

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

router.patch(
  "/:id",
  validateIdParam,
  express.json(),
  validateUpdateAsset,
  updateAsset,
);
router.get("/:id", validateIdParam, getAssetById);

export default router;
