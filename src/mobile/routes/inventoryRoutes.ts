import express from "express";
import {
  getInventoryOverview,
  getInventoryAlerts,
  listInventoryMovements,
  listInventorySales,
  sellFromInventory,
  addInventoryItem,
  listInventoryItems,
  getInventoryItemDetail,
  restockInventoryItem,
  adjustInventoryItem,
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
} from "../../middlewares/validations/inventoryValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/overview", getInventoryOverview);
router.get("/alerts", getInventoryAlerts);
router.get("/movements", withPagination(), listInventoryMovements);
router.get("/sales", withPagination(), listInventorySales);
router.post("/sell", express.json(), validateInventorySell, sellFromInventory);

router.post("/items", express.json(), validateAddInventoryItem, addInventoryItem);
router.get("/items", withPagination(), listInventoryItems);
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
