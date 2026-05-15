import { check } from "express-validator";
import { handleValidation } from "../errorHandler";

export const createExpenseValidation = [
  check("amount")
    .isFloat({ min: 0 })
    .withMessage("Amount must be a positive number"),
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
  check("vatAmount").optional().isFloat({ min: 0 }),
  check("receiptUrl").optional().trim().isString(),
  check("supplierName").optional().trim().isString(),
  check("supplierId").optional().trim().isString(),
  check("Supplier_name").optional().trim().isString(),
  check("Supplier_Id").optional().trim().isString(),
  handleValidation,
];
