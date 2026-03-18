import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import { SALE_CATEGORIES } from "../../constants/saleCategories";

const PAYMENT_TYPES = ["Cash", "Transfer", "Invoice", "Card"];

export const createSaleValidation = [
  check("amount")
    .isFloat({ min: 0 })
    .withMessage("Amount must be a positive number"),
  check("description").trim().notEmpty().withMessage("Description is required"),
  check("category")
    .optional()
    .trim()
    .isIn(SALE_CATEGORIES)
    .withMessage(`category must be one of: ${SALE_CATEGORIES.join(", ")}`),
  check("customerName").optional().trim().isString(),
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
