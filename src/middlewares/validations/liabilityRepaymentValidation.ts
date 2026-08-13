import { body, check } from "express-validator";
import { handleValidation } from "../errorHandler";
import {
  LIABILITY_INTEREST_CALC_METHODS,
  LIABILITY_INTEREST_RATE_TYPES,
  LIABILITY_PAYMENT_SOURCES,
  LIABILITY_REPAYMENT_FREQUENCIES,
  LIABILITY_REPAYMENT_STRUCTURES,
  LIABILITY_TYPES,
} from "../../constants/liabilityRegister";

function requireTrimmed(value: unknown, field: string): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw new Error(`${field} is required`);
  return s;
}

function requirePositiveNumber(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${field} must be greater than 0`);
  }
  return n;
}

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
  check("interestRate")
    .isFloat({ min: 0, max: 100 })
    .withMessage("interestRate must be between 0 and 100"),
  check("interestRateType")
    .trim()
    .notEmpty()
    .isIn([...LIABILITY_INTEREST_RATE_TYPES])
    .withMessage(
      `interestRateType must be one of: ${LIABILITY_INTEREST_RATE_TYPES.join(", ")}`,
    ),
  check("interestCalculationMethod")
    .trim()
    .notEmpty()
    .isIn([...LIABILITY_INTEREST_CALC_METHODS])
    .withMessage(
      `interestCalculationMethod must be one of: ${LIABILITY_INTEREST_CALC_METHODS.join(", ")}`,
    ),
  check("startDate")
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("startDate must be YYYY-MM-DD"),
  check("maturityDate")
    .trim()
    .notEmpty()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("maturityDate must be YYYY-MM-DD"),
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
  check("note").trim().notEmpty().withMessage("note is required"),
  check("evidenceUrl")
    .trim()
    .notEmpty()
    .isURL()
    .withMessage("evidenceUrl must be a valid URL"),
  check("bankName").optional().trim().isString(),
  check("loanPurpose").optional().trim().isString(),
  check("collateral").optional().trim().isString(),
  check("propertyDescription").optional().trim().isString(),
  check("propertyValue").optional().isFloat({ gt: 0 }),
  check("equipmentName").optional().trim().isString(),
  check("equipmentValue").optional().isFloat({ gt: 0 }),
  check("serialNumber").optional().trim().isString(),
  check("assetDescription").optional().trim().isString(),
  check("leasePaymentAmount").optional().isFloat({ gt: 0 }),
  check("conversionTrigger").optional().trim().isString(),
  check("conversionPrice").optional().trim().isString(),
  check("conversionDate")
    .optional()
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("conversionDate must be YYYY-MM-DD"),
  body().custom((body) => {
    const type = String(body?.liabilityType ?? "").trim();
    if (type === "BANK_LOAN") {
      requireTrimmed(body.bankName, "bankName");
      requireTrimmed(body.loanPurpose, "loanPurpose");
      requireTrimmed(body.collateral, "collateral");
    }
    if (type === "MORTGAGE") {
      requireTrimmed(body.propertyDescription, "propertyDescription");
      requirePositiveNumber(body.propertyValue, "propertyValue");
    }
    if (type === "EQUIPMENT_FINANCING") {
      requireTrimmed(body.equipmentName, "equipmentName");
      requirePositiveNumber(body.equipmentValue, "equipmentValue");
    }
    if (type === "LEASE_LIABILITY") {
      requireTrimmed(body.assetDescription, "assetDescription");
      requirePositiveNumber(body.leasePaymentAmount, "leasePaymentAmount");
    }
    if (type === "CONVERTIBLE_LOAN") {
      requireTrimmed(body.conversionTrigger, "conversionTrigger");
      requireTrimmed(body.conversionPrice, "conversionPrice");
      const conversionDate = requireTrimmed(body.conversionDate, "conversionDate");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(conversionDate)) {
        throw new Error("conversionDate must be YYYY-MM-DD");
      }
    }
    return true;
  }),
  handleValidation,
];

export const createLiabilityRepaymentValidation = [
  check("amount")
    .isFloat({ gt: 0 })
    .withMessage("amount must be greater than 0"),
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
  handleValidation,
];
