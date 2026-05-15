import { check } from "express-validator";
import { handleValidation } from "../errorHandler";

const PAYMENT_TYPES = ["Cash", "Transfer", "Invoice", "Card"];

export const createSaleValidation = [
  check("amount")
    .isFloat({ min: 0 })
    .withMessage("Amount must be a positive number"),
  check("description").trim().notEmpty().withMessage("Description is required"),
  check("category")
    .optional({ values: "null" })
    .trim()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage("category must be 1–255 characters when provided"),
  check("customerName").optional().trim().isString(),
  check("customerId").optional().trim().isString(),
  check("Customer_name").optional().trim().isString(),
  check("Customer_id").optional().trim().isString(),
  check("itemName").optional().trim().isString(),
  check("receiptUrl").optional().trim().isString(),
  check("paymentType")
    .isIn(PAYMENT_TYPES)
    .withMessage(`paymentType must be one of: ${PAYMENT_TYPES.join(", ")}`),
  check("date").isISO8601().withMessage("Date must be a valid ISO date"),
  check("vatableIncome")
    .optional()
    .isBoolean()
    .withMessage("vatableIncome must be boolean"),
  check("serviceIncome")
    .optional()
    .isBoolean()
    .withMessage("serviceIncome must be boolean"),
  handleValidation,
];
