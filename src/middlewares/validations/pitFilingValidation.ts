import { body, query } from "express-validator";

export const validatePitCalculationQuery = [
  query("year")
    .exists()
    .withMessage("year is required")
    .isInt({ min: 2000, max: 2100 })
    .toInt(),
];

export const validatePitSubmitBody = [
  body("periodYear").isInt({ min: 2000, max: 2100 }).toInt(),
  body("periodMonth").optional({ nullable: true }),
  body("amount").optional({ nullable: true }).isFloat({ min: 0 }),
  body("dueDate").optional({ nullable: true }).isString(),
  body("paymentStatus").optional({ nullable: true }).isString(),
  body("receiptUrl").optional({ nullable: true }).isString(),
  body("documentUrl").optional({ nullable: true }).isString(),
  body("evidenceVaultId").optional({ nullable: true }).isString(),
  body("stateOfResidence").optional({ nullable: true }).isString(),
  body("tin").optional({ nullable: true }).isString(),
  body("computation").optional({ nullable: true }).isObject(),
  body("submissionReference").optional({ nullable: true }).isString(),
];
