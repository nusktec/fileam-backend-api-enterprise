import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import { SALE_STATUS } from "../../constants/salePaymentRules";

/** PATCH /mobile/expenses/:id/payment-status — confirm Card/Transfer payment. */
export const updateExpensePaymentStatusValidation = [
  check("status")
    .trim()
    .notEmpty()
    .withMessage("status is required")
    .bail()
    .equals(SALE_STATUS.PAID)
    .withMessage('status must be "PAID"'),
  check("bankCode")
    .optional({ nullable: true })
    .trim()
    .isString()
    .withMessage("bankCode must be a string"),
  handleValidation,
];
