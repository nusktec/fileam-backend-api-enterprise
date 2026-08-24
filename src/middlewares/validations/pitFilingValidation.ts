import { body, query } from "express-validator";
import {
  PIT_STATE_OF_RESIDENCE_VALUES,
  PIT_PERIOD_MONTH,
} from "../../constants/pitFiling";

export const validatePitCalculationQuery = [
  query("year")
    .exists()
    .withMessage("year is required")
    .isInt({ min: 2000, max: 2100 })
    .toInt(),
];

export const validatePitSubmitBody = [
  body("periodYear").isInt({ min: 2000, max: 2100 }).toInt(),
  body("periodMonth").custom((v) => Number(v) === PIT_PERIOD_MONTH),
  body("amount").isFloat({ min: 0 }),
  body("dueDate").matches(/^\d{4}-\d{2}-\d{2}$/),
  body("paymentStatus").isIn(["unpaid", "paid"]),
  body("receiptUrl").optional({ nullable: true }).isString(),
  body("documentUrl").optional({ nullable: true }).isString(),
  body("evidenceVaultId").optional({ nullable: true }).isString(),
  body("stateOfResidence")
    .isString()
    .trim()
    .isIn([...PIT_STATE_OF_RESIDENCE_VALUES]),
  body("tin").isString().trim().notEmpty(),
  body("computation").isObject(),
  body("computation.tradingProfit").isFloat(),
  body("computation.otherBusinessIncome").isFloat({ min: 0 }),
  body("computation.otherPersonalIncome").isFloat({ min: 0 }),
  body("computation.payerFees").isFloat({ min: 0 }),
  body("computation.payerFeesIncludedInSales").isBoolean(),
  body("computation.pensionContribution").isFloat({ min: 0 }),
  body("computation.nhfContribution").isFloat({ min: 0 }),
  body("computation.nhisContribution").isFloat({ min: 0 }),
  body("computation.annualRent").isFloat({ min: 0 }),
  body("computation.lifeAssurance").isFloat({ min: 0 }),
  body("computation.mortgageInterest").isFloat({ min: 0 }),
  body("computation.payeCredits").isFloat({ min: 0 }),
  body("computation.whtCredits").isFloat({ min: 0 }),
  body("computation.remainingPayable").isFloat({ min: 0 }),
  body("computation.minimumWageExempt").isBoolean(),
  body("computation.rentPeriodStart").optional({ nullable: true }).isString(),
  body("computation.rentPeriodEnd").optional({ nullable: true }).isString(),
  body("computation.landlordName").optional({ nullable: true }).isString(),
  body("computation.landlordContact").optional({ nullable: true }).isString(),
  body("computation.propertyAddress").optional({ nullable: true }).isString(),
];
