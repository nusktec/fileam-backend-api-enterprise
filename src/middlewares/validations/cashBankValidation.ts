import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import {
  BANK_ACCOUNT_PURPOSES,
  BANK_ACCOUNT_TYPES,
  CASH_TYPES,
  OPENING_BALANCE_SOURCES,
} from "../../constants/cashBank";

export const createCashValidation = [
  check("cashType")
    .trim()
    .isIn([...CASH_TYPES])
    .withMessage(`cashType must be one of: ${CASH_TYPES.join(", ")}`),
  check("amount")
    .isFloat({ gt: 0 })
    .withMessage("amount must be greater than 0"),
  check("note").optional().trim(),
  handleValidation,
];

export const createBankAccountValidation = [
  check("bankName").trim().notEmpty().withMessage("bankName is required"),
  check("accountName").trim().notEmpty().withMessage("accountName is required"),
  check("accountNumber")
    .trim()
    .notEmpty()
    .withMessage("accountNumber is required"),
  check("accountType")
    .trim()
    .isIn([...BANK_ACCOUNT_TYPES])
    .withMessage(`accountType must be one of: ${BANK_ACCOUNT_TYPES.join(", ")}`),
  check("accountPurpose")
    .trim()
    .isIn([...BANK_ACCOUNT_PURPOSES])
    .withMessage(
      `accountPurpose must be one of: ${BANK_ACCOUNT_PURPOSES.join(", ")}`,
    ),
  check("sourceOfOpeningBalance")
    .optional()
    .isIn([...OPENING_BALANCE_SOURCES]),
  check("openingBalance")
    .isFloat({ gt: 0 })
    .withMessage("openingBalance must be greater than 0"),
  check("balanceDate")
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("balanceDate must be YYYY-MM-DD"),
  handleValidation,
];
