import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import { requiredMonetaryAmount } from "./monetaryAmountValidation";

const PAYMENT_TYPES = ["Cash", "Transfer", "Invoice", "Card"];

export const createSaleValidation = [
  requiredMonetaryAmount("amount", "Amount"),
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
  check("vatInclusive")
    .optional()
    .isBoolean()
    .withMessage("vatInclusive must be boolean"),
  check("serviceIncome")
    .optional()
    .isBoolean()
    .withMessage("serviceIncome must be boolean"),
  handleValidation,
];

export const bulkCreateSalesValidation = [
  check("items")
    .isArray({ min: 1, max: 100 })
    .withMessage("items must be an array of 1–100 sales"),
  check("items.*.amount")
    .isFloat({ min: 0 })
    .withMessage("Each item amount must be a non-negative number"),
  check("items.*.description")
    .trim()
    .notEmpty()
    .withMessage("Each item description is required"),
  check("items.*.paymentType")
    .isIn(PAYMENT_TYPES)
    .withMessage(`Each paymentType must be one of: ${PAYMENT_TYPES.join(", ")}`),
  check("items.*.date")
    .isISO8601()
    .withMessage("Each date must be a valid ISO date"),
  check("items.*.category")
    .optional({ values: "null" })
    .trim()
    .isString()
    .isLength({ min: 1, max: 255 }),
  check("items.*.customerName").optional().trim().isString(),
  check("items.*.customerId").optional().trim().isString(),
  check("items.*.itemName").optional().trim().isString(),
  check("items.*.receiptUrl").optional().trim().isString(),
  check("items.*.vatableIncome").optional().isBoolean(),
  check("items.*.vatInclusive").optional().isBoolean(),
  check("items.*.serviceIncome").optional().isBoolean(),
  handleValidation,
];
