import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import { SALE_CATEGORIES } from "../../constants/saleCategories";

const PAYMENT_TYPES = ["Cash", "Transfer", "Invoice", "Card"];

/** PATCH /mobile/sales/:id — all fields optional; at least one should be sent. */
export const updateSaleValidation = [
  check("amount").optional().isFloat({ min: 0 }),
  check("description").optional().trim().notEmpty(),
  check("category")
    .optional()
    .trim()
    .isIn(SALE_CATEGORIES)
    .withMessage(`category must be one of: ${SALE_CATEGORIES.join(", ")}`),
  check("customerName").optional({ nullable: true }).trim(),
  check("customerId").optional({ nullable: true }).trim(),
  check("Customer_name").optional().trim(),
  check("Customer_id").optional().trim(),
  check("itemName").optional({ nullable: true }).trim(),
  check("receiptUrl").optional({ nullable: true }).trim(),
  check("paymentType")
    .optional()
    .isIn(PAYMENT_TYPES)
    .withMessage(`paymentType must be one of: ${PAYMENT_TYPES.join(", ")}`),
  check("date").optional().isISO8601(),
  check("vatableIncome").optional().isBoolean(),
  check("serviceIncome").optional().isBoolean(),
  check("status")
    .optional()
    .isIn(["Paid", "Pending", "Overdue"])
    .withMessage("status must be Paid, Pending, or Overdue"),
  handleValidation,
];
