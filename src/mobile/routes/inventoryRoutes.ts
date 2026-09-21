import express from "express";
import {
  getInventoryOverview,
  getInventoryPeriodSummary,
  getInventoryAlerts,
  listInventoryMovements,
  listInventorySales,
  getInventorySaleDetail,
  getInventorySaleUndoCheck,
  undoInventorySale,
  sellFromInventory,
  addInventoryItem,
  listInventoryItems,
  getInventoryItemDetail,
  restockInventoryItem,
  adjustInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from "../controllers/inventoryController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { withPagination } from "../../middlewares/paginationMiddleware";
import { validateIdParam } from "../../middlewares/validations/mobileValidation";
import {
  validateAddInventoryItem,
  validateInventorySell,
  validateInventoryRestock,
  validateInventoryAdjustment,
  validateUpdateInventoryItem,
  validateInventorySaleUndo,
} from "../../middlewares/validations/inventoryValidation";
import { inventoryPeriodSummaryValidation } from "../../middlewares/validations/inventoryPeriodSummaryValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/overview", getInventoryOverview);
router.get(
  "/summary",
  inventoryPeriodSummaryValidation,
  getInventoryPeriodSummary,
);
router.get("/alerts", getInventoryAlerts);
router.get("/movements", withPagination(), listInventoryMovements);
router.get("/sales", withPagination(), listInventorySales);
router.get("/sales/:id/undo", validateIdParam, getInventorySaleUndoCheck);
router.post(
  "/sales/:id/undo",
  validateIdParam,
  express.json(),
  validateInventorySaleUndo,
  undoInventorySale,
);
router.get("/sales/:id", validateIdParam, getInventorySaleDetail);
router.post("/sell", express.json(), validateInventorySell, sellFromInventory);

router.post("/items", express.json(), validateAddInventoryItem, addInventoryItem);
router.get("/items", withPagination(), listInventoryItems);
router.patch(
  "/items/:id",
  validateIdParam,
  express.json(),
  validateUpdateInventoryItem,
  updateInventoryItem,
);
router.delete("/items/:id", validateIdParam, deleteInventoryItem);
router.post(
  "/items/:id/restock",
  validateIdParam,
  express.json(),
  validateInventoryRestock,
  restockInventoryItem,
);
router.post(
  "/items/:id/adjustment",
  validateIdParam,
  express.json(),
  validateInventoryAdjustment,
  adjustInventoryItem,
);
router.get("/items/:id", validateIdParam, getInventoryItemDetail);

export default router;
