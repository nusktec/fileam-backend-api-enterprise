import { check, param } from "express-validator";
import { handleValidation } from "../errorHandler";
import { EMPLOYMENT_TYPES } from "../../constants/employmentTypes";

/**
 * Use on routes that have :id param (e.g. GET /documents/:id).
 * Use only on routes already protected by authenticate() middleware.
 */
export const validateIdParam = [
  param("id").notEmpty().trim().withMessage("ID is required"),
  handleValidation,
];

/** Consultant routes acting on a linked client user (UUID). */
export const validateClientUserIdParam = [
  param("clientUserId")
    .notEmpty()
    .trim()
    .isUUID()
    .withMessage("clientUserId must be a valid UUID"),
  handleValidation,
];

/** Create employee: fullName, jobTitle, employmentType, basicSalary required. */
export const validateCreateEmployee = [
  check("fullName").trim().notEmpty().withMessage("fullName is required"),
  check("jobTitle").trim().notEmpty().withMessage("jobTitle is required"),
  check("employmentType")
    .trim()
    .isIn(EMPLOYMENT_TYPES)
    .withMessage(`employmentType must be one of: ${EMPLOYMENT_TYPES.join(", ")}`),
  check("basicSalary")
    .notEmpty()
    .withMessage("basicSalary is required")
    .bail()
    .isFloat({ min: 0 })
    .withMessage("basicSalary must be a non-negative number"),
  check("housingAllowance").optional().isFloat({ min: 0 }),
  check("transportAllowance").optional().isFloat({ min: 0 }),
  check("mealAllowance").optional().isFloat({ min: 0 }),
  check("otherAllowances").optional().isFloat({ min: 0 }),
  check("otherTaxableIncome").optional().isFloat({ min: 0 }),
  check("stateOfResidence").optional().trim().isString(),
  check("startDate").optional().isISO8601(),
  check("tin").optional().trim().isString(),
  check("pensionRsa").optional().trim().isString(),
  check("pfa").optional().trim().isString(),
  check("annualHouseRent").optional().isFloat({ min: 0 }),
  check("nhf").optional().isBoolean().withMessage("nhf must be a boolean"),
  check("nhisHealthInsurance").optional().isFloat({ min: 0 }),
  check("lifeAssurancePremium").optional().isFloat({ min: 0 }),
  check("mortgageInterest").optional().isFloat({ min: 0 }),
  check("qualifyingMedicalExpenses").optional().isFloat({ min: 0 }),
  check("otherAllowableDeductions").optional().isFloat({ min: 0 }),
  handleValidation,
];

/** PATCH /mobile/employees/:id — all fields optional. */
export const validateUpdateEmployee = [
  check("fullName").optional().trim().notEmpty(),
  check("jobTitle").optional().trim().notEmpty(),
  check("employmentType")
    .optional()
    .trim()
    .isIn(EMPLOYMENT_TYPES)
    .withMessage(`employmentType must be one of: ${EMPLOYMENT_TYPES.join(", ")}`),
  check("basicSalary").optional().isFloat({ min: 0 }),
  check("housingAllowance").optional().isFloat({ min: 0 }),
  check("transportAllowance").optional().isFloat({ min: 0 }),
  check("mealAllowance").optional().isFloat({ min: 0 }),
  check("otherAllowances").optional().isFloat({ min: 0 }),
  check("otherTaxableIncome").optional().isFloat({ min: 0 }),
  check("stateOfResidence").optional({ nullable: true }).trim().isString(),
  check("startDate").optional().isISO8601(),
  check("tin").optional({ nullable: true }).trim().isString(),
  check("pensionRsa").optional({ nullable: true }).trim().isString(),
  check("pfa").optional({ nullable: true }).trim().isString(),
  check("annualHouseRent").optional().isFloat({ min: 0 }),
  check("nhf").optional().isBoolean().withMessage("nhf must be a boolean"),
  check("nhisHealthInsurance").optional().isFloat({ min: 0 }),
  check("lifeAssurancePremium").optional().isFloat({ min: 0 }),
  check("mortgageInterest").optional().isFloat({ min: 0 }),
  check("qualifyingMedicalExpenses").optional().isFloat({ min: 0 }),
  check("otherAllowableDeductions").optional().isFloat({ min: 0 }),
  handleValidation,
];
