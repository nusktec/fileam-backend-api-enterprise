import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import {
  LIABILITY_INTEREST_CALC_METHODS,
  LIABILITY_INTEREST_RATE_TYPES,
  LIABILITY_PAYMENT_SOURCES,
  LIABILITY_REPAYMENT_FREQUENCIES,
  LIABILITY_REPAYMENT_STRUCTURES,
  LIABILITY_TYPES,
} from "../../constants/liabilityRegister";

export const createRegisteredLiabilityValidation = [
  check("name").trim().notEmpty().withMessage("name is required"),
  check("liabilityType")
    .trim()
    .notEmpty()
    .isIn([...LIABILITY_TYPES])
    .withMessage(`liabilityType must be one of: ${LIABILITY_TYPES.join(", ")}`),
  check("creditor").trim().notEmpty().withMessage("creditor is required"),
  check("principalAmount")
    .isFloat({ gt: 0 })
    .withMessage("principalAmount must be greater than 0"),
  check("startDate")
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("startDate must be YYYY-MM-DD"),
  check("maturityDate")
    .optional({ nullable: true })
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("maturityDate must be YYYY-MM-DD"),
  check("interestRate")
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage("interestRate must be >= 0"),
  check("interestRateType")
    .optional({ nullable: true })
    .trim()
    .isIn([...LIABILITY_INTEREST_RATE_TYPES])
    .withMessage(
      `interestRateType must be one of: ${LIABILITY_INTEREST_RATE_TYPES.join(", ")}`,
    ),
  check("interestCalculationMethod")
    .optional({ nullable: true })
    .trim()
    .isIn([...LIABILITY_INTEREST_CALC_METHODS])
    .withMessage(
      `interestCalculationMethod must be one of: ${LIABILITY_INTEREST_CALC_METHODS.join(", ")}`,
    ),
  check("repaymentFrequency")
    .trim()
    .notEmpty()
    .isIn([...LIABILITY_REPAYMENT_FREQUENCIES])
    .withMessage(
      `repaymentFrequency must be one of: ${LIABILITY_REPAYMENT_FREQUENCIES.join(", ")}`,
    ),
  check("repaymentStructure")
    .trim()
    .notEmpty()
    .isIn([...LIABILITY_REPAYMENT_STRUCTURES])
    .withMessage(
      `repaymentStructure must be one of: ${LIABILITY_REPAYMENT_STRUCTURES.join(", ")}`,
    ),
  check("evidenceUrl")
    .optional({ nullable: true })
    .trim()
    .isURL()
    .withMessage("evidenceUrl must be a valid URL"),
  check("note").optional({ nullable: true }).trim().isString(),
  handleValidation,
];

export const createLiabilityRepaymentValidation = [
  check("liabilityId").trim().notEmpty().withMessage("liabilityId is required"),
  check("repaymentAmount")
    .isFloat({ gt: 0 })
    .withMessage("repaymentAmount must be greater than 0"),
  check("paymentDate")
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("paymentDate must be YYYY-MM-DD"),
  check("paymentSource")
    .trim()
    .isIn([...LIABILITY_PAYMENT_SOURCES])
    .withMessage(
      `paymentSource must be one of: ${LIABILITY_PAYMENT_SOURCES.join(", ")}`,
    ),
  check("evidenceUrl")
    .optional({ nullable: true })
    .trim()
    .isURL()
    .withMessage("evidenceUrl must be a valid URL"),
  check("note").optional({ nullable: true }).trim().isString(),
  handleValidation,
];
