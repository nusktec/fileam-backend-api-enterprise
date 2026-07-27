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
  check("createSalesInvoice").optional().isBoolean().toBoolean(),
  check("paymentType").optional().trim().isString(),
  check("saleDate")
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("saleDate must be YYYY-MM-DD"),
  check("vatableIncome").optional().isBoolean().toBoolean(),
  check("vatInclusive").optional().isBoolean().toBoolean(),
  check("serviceIncome").optional().isBoolean().toBoolean(),
  check("saleCategory")
    .optional({ values: "null" })
    .trim()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage("saleCategory must be 1–255 characters when provided"),
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
  check("createSalesInvoice").optional().isBoolean().toBoolean(),
  check("paymentType").optional().trim().isString(),
  check("saleDate")
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("saleDate must be YYYY-MM-DD"),
  check("vatableIncome").optional().isBoolean().toBoolean(),
  check("vatInclusive").optional().isBoolean().toBoolean(),
  check("serviceIncome").optional().isBoolean().toBoolean(),
  check("saleCategory")
    .optional({ values: "null" })
    .trim()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage("saleCategory must be 1–255 characters when provided"),
  check("expenseCategory")
    .optional({ values: "null" })
    .trim()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage("expenseCategory must be 1–255 characters when provided"),
  handleValidation,
];

export const validateUpdateInventoryItem = [
  check("name").optional().trim().notEmpty().withMessage("name cannot be empty"),
  check("category")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("category cannot be empty"),
  check("purchaseCost")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("purchaseCost must be a non-negative number"),
  check("sellingPrice")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("sellingPrice must be a non-negative number"),
  check("lowStockAlertLevel")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("lowStockAlertLevel must be non-negative"),
  check("supplierName").optional({ nullable: true }).trim().isString(),
  check("supplierId").optional({ nullable: true }).trim().isString(),
  handleValidation,
];
