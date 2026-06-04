import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import { optionalMonetaryAmount } from "./monetaryAmountValidation";

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
  handleValidation,
];
