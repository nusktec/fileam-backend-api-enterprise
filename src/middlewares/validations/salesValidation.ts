import { check, body } from "express-validator";
import { handleValidation } from "../errorHandler";
import { requiredMonetaryAmount } from "./monetaryAmountValidation";

const PAYMENT_TYPES = ["Cash", "Transfer", "Invoice", "Card"];
const BULK_CREATE_MAX = 100;

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
  check("serviceIncome")
    .optional()
    .isBoolean()
    .withMessage("serviceIncome must be boolean"),
  handleValidation,
];

export const bulkCreateSaleValidation = [
  body("items")
    .isArray({ min: 1, max: BULK_CREATE_MAX })
    .withMessage(`items must be an array of 1–${BULK_CREATE_MAX} sales`),
  requiredMonetaryAmount("items.*.amount", "Amount"),
  check("items.*.description")
    .trim()
    .notEmpty()
    .withMessage("Description is required"),
  check("items.*.category")
    .optional({ values: "null" })
    .trim()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage("category must be 1–255 characters when provided"),
  check("items.*.customerName").optional().trim().isString(),
  check("items.*.customerId").optional().trim().isString(),
  check("items.*.Customer_name").optional().trim().isString(),
  check("items.*.Customer_id").optional().trim().isString(),
  check("items.*.itemName").optional().trim().isString(),
  check("items.*.receiptUrl").optional().trim().isString(),
  check("items.*.paymentType")
    .isIn(PAYMENT_TYPES)
    .withMessage(`paymentType must be one of: ${PAYMENT_TYPES.join(", ")}`),
  check("items.*.date")
    .isISO8601()
    .withMessage("Date must be a valid ISO date"),
  check("items.*.vatableIncome")
    .optional()
    .isBoolean()
    .withMessage("vatableIncome must be boolean"),
  check("items.*.serviceIncome")
    .optional()
    .isBoolean()
    .withMessage("serviceIncome must be boolean"),
  handleValidation,
];
