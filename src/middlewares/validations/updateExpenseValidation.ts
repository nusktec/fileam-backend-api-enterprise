import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import { optionalMonetaryAmount } from "./monetaryAmountValidation";

const PAYMENT_TYPES = ["Cash", "Transfer", "Invoice", "Card"];

/** PATCH /mobile/expenses/:id — all fields optional. */
export const updateExpenseValidation = [
  optionalMonetaryAmount("amount", "Amount"),
  check("description").optional().trim().notEmpty(),
  check("category")
    .optional({ values: "null" })
    .trim()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage("category must be 1–255 characters when provided"),
  check("date").optional().isISO8601(),
  check("vatInclusive").optional().isBoolean(),
  optionalMonetaryAmount("vatAmount", "VAT amount"),
  check("receiptUrl").optional({ nullable: true }).trim(),
  check("supplierName").optional({ nullable: true }).trim(),
  check("supplierId").optional({ nullable: true }).trim(),
  check("Supplier_name").optional().trim(),
  check("Supplier_Id").optional().trim(),
  check("expenseType")
    .optional()
    .trim()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage("expenseType must be 1–255 characters when provided"),
  check("paymentType")
    .optional()
    .isIn(PAYMENT_TYPES)
    .withMessage(`paymentType must be one of: ${PAYMENT_TYPES.join(", ")}`),
  check("invoiceDueDate")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("invoiceDueDate must be a valid ISO date"),
  check("invoicePaidAmount")
    .optional({ values: "null" })
    .isFloat({ min: 0 })
    .withMessage("invoicePaidAmount must be a non-negative number"),
  handleValidation,
];
