import { check, param } from "express-validator";
import { handleValidation } from "../errorHandler";

/**
 * Use on routes that have :id param (e.g. GET /documents/:id).
 * Use only on routes already protected by authenticate() middleware.
 */
export const validateIdParam = [
  param("id").notEmpty().trim().withMessage("ID is required"),
  handleValidation,
];

/** Create employee: fullName, jobTitle, employmentType, basicSalary required. */
export const validateCreateEmployee = [
  check("fullName").trim().notEmpty().withMessage("fullName is required"),
  check("jobTitle").trim().notEmpty().withMessage("jobTitle is required"),
  check("employmentType").trim().notEmpty().withMessage("employmentType is required"),
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
  check("stateOfResidence").optional().trim().isString(),
  check("startDate").optional().isISO8601(),
  check("tin").optional().trim().isString(),
  check("pensionRsa").optional().trim().isString(),
  handleValidation,
];
