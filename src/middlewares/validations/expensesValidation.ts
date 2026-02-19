import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import { EXPENSE_CATEGORIES } from "../../constants/expenseCategories";

export const createExpenseValidation = [
  check("amount").isFloat({ min: 0 }).withMessage("Amount must be a positive number"),
  check("description").trim().notEmpty().withMessage("Description is required"),
  check("category")
    .isIn([...EXPENSE_CATEGORIES])
    .withMessage(`category must be one of: ${EXPENSE_CATEGORIES.join(", ")}`),
  check("date").isISO8601().withMessage("Date must be a valid ISO date"),
  check("vatInclusive").optional().isBoolean().withMessage("vatInclusive must be boolean"),
  check("vatAmount").optional().isFloat({ min: 0 }),
  check("receiptUrl").optional().trim().isString(),
  handleValidation,
];
