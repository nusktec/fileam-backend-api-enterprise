import express from "express";
import {
  listPendingAssets,
  getPendingAsset,
  approveAsset,
  returnAsset,
  expenseAsset,
  listRegister,
  getRegisterAsset,
  patchRegisterAsset,
  exportRegister,
  getDepreciationSchedule,
  listAssetHistory,
  generateAssetReport,
  downloadAssetFile,
} from "../controllers/enterpriseAssetsController";

const router = express.Router({ mergeParams: true });

router.get("/pending", listPendingAssets);
router.get("/pending/:assetId", getPendingAsset);

router.get("/register/export", exportRegister);
router.get("/register", listRegister);
router.get("/register/:assetId", getRegisterAsset);
router.patch("/register/:assetId", patchRegisterAsset);

router.get("/history", listAssetHistory);
router.post("/reports/generate", generateAssetReport);
router.get("/downloads/:downloadId", downloadAssetFile);

router.get("/:assetId/depreciation-schedule", getDepreciationSchedule);
router.post("/:assetId/approve", approveAsset);
router.post("/:assetId/return", returnAsset);
router.post("/:assetId/expense", expenseAsset);

export default router;
