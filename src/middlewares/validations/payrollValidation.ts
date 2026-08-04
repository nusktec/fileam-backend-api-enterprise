import { check, param } from "express-validator";
import { handleValidation } from "../errorHandler";
import { PERIOD_REGEX } from "../../constants/payrollObligations";

export const validatePayrollPeriodQuery = [
  check("period")
    .optional()
    .matches(PERIOD_REGEX)
    .withMessage("period must be YYYY-MM"),
  handleValidation,
];

export const validatePayrollPeriodParam = [
  param("period")
    .matches(PERIOD_REGEX)
    .withMessage("period must be YYYY-MM"),
  handleValidation,
];

export const validateNhfApplicability = [
  check("isNhfApplicable")
    .exists()
    .withMessage("isNhfApplicable is required")
    .bail()
    .isBoolean()
    .withMessage("isNhfApplicable must be boolean"),
  handleValidation,
];

export const validatePayrollEvidence = [
  check("url").trim().notEmpty().withMessage("url is required"),
  check("evidenceType")
    .trim()
    .notEmpty()
    .withMessage("evidenceType is required"),
  handleValidation,
];

export const validateAssignPayrollConsultant = [
  check("consultantId")
    .trim()
    .notEmpty()
    .withMessage("consultantId is required"),
  handleValidation,
];
