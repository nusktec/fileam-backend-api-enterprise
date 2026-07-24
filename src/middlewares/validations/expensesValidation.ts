import { check, body } from "express-validator";
import { handleValidation } from "../errorHandler";
import {
  optionalMonetaryAmount,
  requiredMonetaryAmount,
} from "./monetaryAmountValidation";

const BULK_CREATE_MAX = 100;

export const createExpenseValidation = [
  requiredMonetaryAmount("amount", "Amount"),
  check("description").trim().notEmpty().withMessage("Description is required"),
  check("category")
    .trim()
    .notEmpty()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage("category is required (max 255 characters)"),
  check("date").isISO8601().withMessage("Date must be a valid ISO date"),
  check("vatInclusive")
    .optional()
    .isBoolean()
    .withMessage("vatInclusive must be boolean"),
  optionalMonetaryAmount("vatAmount", "VAT amount"),
  check("receiptUrl").optional().trim().isString(),
  check("supplierName").optional().trim().isString(),
  check("supplierId").optional().trim().isString(),
  check("Supplier_name").optional().trim().isString(),
  check("Supplier_Id").optional().trim().isString(),
  check("expenseType")
    .optional()
    .trim()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage("expenseType must be 1–255 characters when provided"),
  handleValidation,
];

export const bulkCreateExpenseValidation = [
  body("items")
    .isArray({ min: 1, max: BULK_CREATE_MAX })
    .withMessage(`items must be an array of 1–${BULK_CREATE_MAX} expenses`),
  requiredMonetaryAmount("items.*.amount", "Amount"),
  check("items.*.description")
    .trim()
    .notEmpty()
    .withMessage("Description is required"),
  check("items.*.category")
    .trim()
    .notEmpty()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage("category is required (max 255 characters)"),
  check("items.*.date")
    .isISO8601()
    .withMessage("Date must be a valid ISO date"),
  check("items.*.vatInclusive")
    .optional()
    .isBoolean()
    .withMessage("vatInclusive must be boolean"),
  optionalMonetaryAmount("items.*.vatAmount", "VAT amount"),
  check("items.*.receiptUrl").optional().trim().isString(),
  check("items.*.supplierName").optional().trim().isString(),
  check("items.*.supplierId").optional().trim().isString(),
  check("items.*.Supplier_name").optional().trim().isString(),
  check("items.*.Supplier_Id").optional().trim().isString(),
  check("items.*.expenseType")
    .optional()
    .trim()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage("expenseType must be 1–255 characters when provided"),
  handleValidation,
];
