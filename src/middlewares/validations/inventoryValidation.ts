import { check, body } from "express-validator";
import { handleValidation } from "../errorHandler";

export const validateAddInventoryItem = [
  check("name").trim().notEmpty().withMessage("name is required"),
  check("category").trim().notEmpty().withMessage("category is required"),
  check("purchaseCost")
    .isFloat({ min: 0 })
    .withMessage("purchaseCost must be a non-negative number"),
  check("sellingPrice")
    .isFloat({ min: 0 })
    .withMessage("sellingPrice must be a non-negative number"),
  check("openingQuantity")
    .isFloat({ min: 0 })
    .withMessage("openingQuantity must be non-negative"),
  check("lowStockAlertLevel")
    .isFloat({ min: 0 })
    .withMessage("lowStockAlertLevel must be non-negative"),
  check("supplierName").optional().trim().isString(),
  check("supplierId").optional().trim().isString(),
  handleValidation,
];

export const validateInventorySell = [
  body("lines")
    .isArray({ min: 1 })
    .withMessage("lines must be a non-empty array"),
  body("lines.*.inventoryItemId")
    .trim()
    .isUUID()
    .withMessage("each line needs a valid inventoryItemId (UUID)"),
  body("lines.*.quantity")
    .isFloat({ gt: 0 })
    .withMessage("each line quantity must be positive"),
  check("customerName").optional().trim().isString(),
  check("customerId").optional().trim().isString(),
  handleValidation,
];

export const validateInventoryRestock = [
  check("quantity")
    .isFloat({ gt: 0 })
    .withMessage("quantity must be a positive number"),
  check("note").optional().trim().isString(),
  handleValidation,
];

export const validateInventoryAdjustment = [
  check("direction")
    .trim()
    .isIn(["in", "out"])
    .withMessage("direction must be in or out"),
  check("quantity")
    .isFloat({ gt: 0 })
    .withMessage("quantity must be a positive number"),
  check("note").optional().trim().isString(),
  handleValidation,
];
