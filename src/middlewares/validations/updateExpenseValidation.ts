import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import { EXPENSE_CATEGORIES } from "../../constants/expenseCategories";

/** PATCH /mobile/expenses/:id — all fields optional. */
export const updateExpenseValidation = [
  check("amount").optional().isFloat({ min: 0 }),
  check("description").optional().trim().notEmpty(),
  check("category")
    .optional()
    .isIn([...EXPENSE_CATEGORIES])
    .withMessage(`category must be one of: ${EXPENSE_CATEGORIES.join(", ")}`),
  check("date").optional().isISO8601(),
  check("vatInclusive").optional().isBoolean(),
  check("vatAmount").optional().isFloat({ min: 0 }),
  check("receiptUrl").optional({ nullable: true }).trim(),
  check("supplierName").optional({ nullable: true }).trim(),
  check("supplierId").optional({ nullable: true }).trim(),
  check("Supplier_name").optional().trim(),
  check("Supplier_Id").optional().trim(),
  handleValidation,
];
