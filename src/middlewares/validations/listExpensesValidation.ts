import { query } from "express-validator";
import { handleValidation } from "../errorHandler";
import { EXPENSE_CLASSES } from "../../constants/expenseClass";

export const listExpensesValidation = [
  query("class")
    .optional()
    .isIn(EXPENSE_CLASSES)
    .withMessage(
      `class filter must be one of: ${EXPENSE_CLASSES.join(", ")}`,
    ),
  handleValidation,
];
