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
    .isIn(["OPEX", "COGS", "CAPEX", "Tax"])
    .withMessage("expenseType must be one of: OPEX, COGS, CAPEX, Tax"),
  handleValidation,
];
