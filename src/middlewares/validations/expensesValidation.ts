import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import {
  optionalMonetaryAmount,
  requiredMonetaryAmount,
} from "./monetaryAmountValidation";

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

export const bulkCreateExpensesValidation = [
  check("items")
    .isArray({ min: 1, max: 100 })
    .withMessage("items must be an array of 1–100 expenses"),
  check("items.*.amount")
    .isFloat({ min: 0 })
    .withMessage("Each item amount must be a non-negative number"),
  check("items.*.description")
    .trim()
    .notEmpty()
    .withMessage("Each item description is required"),
  check("items.*.category")
    .trim()
    .notEmpty()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage("Each item category is required (max 255 characters)"),
  check("items.*.date")
    .isISO8601()
    .withMessage("Each date must be a valid ISO date"),
  check("items.*.vatInclusive").optional().isBoolean(),
  check("items.*.vatAmount")
    .optional({ values: "null" })
    .isFloat({ min: 0 }),
  check("items.*.receiptUrl").optional().trim().isString(),
  check("items.*.supplierName").optional().trim().isString(),
  check("items.*.supplierId").optional().trim().isString(),
  check("items.*.expenseType")
    .optional()
    .trim()
    .isString()
    .isLength({ min: 1, max: 255 }),
  handleValidation,
];
