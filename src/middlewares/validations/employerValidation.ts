import { body, check, param, query } from "express-validator";
import {
  EMPLOYER_PAYMENT_FREQUENCIES,
  EMPLOYER_PAYMENT_METHODS,
  EMPLOYER_PFA_NAMES,
  EMPLOYER_RELATIONSHIPS,
  EMPLOYER_TAX_TREATMENTS,
  EMPLOYER_TYPES,
  EMPLOYMENT_STATUSES,
  PENSION_STATUSES,
  STATE_OF_EMPLOYMENT_VALUES,
} from "../../constants/employer";

export const createEmployerValidation = [
  check("employerType").isIn(EMPLOYER_TYPES),
  check("name").trim().notEmpty(),
  check("address").trim().notEmpty(),
  check("relationship").isIn(EMPLOYER_RELATIONSHIPS),
  check("stateOfEmployment").isIn(STATE_OF_EMPLOYMENT_VALUES),
  check("startDate").matches(/^\d{4}-\d{2}-\d{2}$/),
  check("endDate").optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}$/),
  check("paymentMethod").isIn(EMPLOYER_PAYMENT_METHODS),
  check("paymentFrequency").isIn(EMPLOYER_PAYMENT_FREQUENCIES),
  check("basicSalary").isFloat({ min: 0 }),
  check("hasPension").isBoolean(),
  check("cacNumber").optional({ nullable: true }).isString(),
  check("tin").optional({ nullable: true }).isString(),
  check("email").optional({ nullable: true }).isEmail(),
  check("phone").optional({ nullable: true }).isString(),
  check("housingAllowance").optional().isFloat({ min: 0 }),
  check("transportAllowance").optional().isFloat({ min: 0 }),
  check("otherAllowances").optional().isFloat({ min: 0 }),
  check("bonuses").optional().isFloat({ min: 0 }),
  check("commissions").optional().isFloat({ min: 0 }),
  check("pensionStatus").optional().isIn(PENSION_STATUSES),
  check("rsaPin").optional({ nullable: true }).isString(),
  check("pfa").optional({ nullable: true }).isIn(EMPLOYER_PFA_NAMES),
  check("employeeRate").optional().isFloat({ min: 0, max: 100 }),
  check("employerRate").optional().isFloat({ min: 0, max: 100 }),
];

export const updateEmployerValidation = [
  param("id").notEmpty(),
  check("employerType").optional().isIn(EMPLOYER_TYPES),
  check("name").optional().trim().notEmpty(),
  check("address").optional().trim().notEmpty(),
  check("relationship").optional().isIn(EMPLOYER_RELATIONSHIPS),
  check("stateOfEmployment").optional().isIn(STATE_OF_EMPLOYMENT_VALUES),
  check("startDate").optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  check("endDate").optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}$/),
  check("paymentMethod").optional().isIn(EMPLOYER_PAYMENT_METHODS),
  check("paymentFrequency").optional().isIn(EMPLOYER_PAYMENT_FREQUENCIES),
  check("basicSalary").optional().isFloat({ min: 0 }),
  check("hasPension").optional().isBoolean(),
  check("cacNumber").optional({ nullable: true }).isString(),
  check("tin").optional({ nullable: true }).isString(),
  check("email").optional({ nullable: true }).isEmail(),
  check("phone").optional({ nullable: true }).isString(),
  check("housingAllowance").optional().isFloat({ min: 0 }),
  check("transportAllowance").optional().isFloat({ min: 0 }),
  check("otherAllowances").optional().isFloat({ min: 0 }),
  check("bonuses").optional().isFloat({ min: 0 }),
  check("commissions").optional().isFloat({ min: 0 }),
  check("pensionStatus").optional().isIn(PENSION_STATUSES),
  check("rsaPin").optional({ nullable: true }).isString(),
  check("pfa").optional({ nullable: true }).isIn(EMPLOYER_PFA_NAMES),
  check("employeeRate").optional().isFloat({ min: 0, max: 100 }),
  check("employerRate").optional().isFloat({ min: 0, max: 100 }),
];

export const listEmployersValidation = [
  query("status").optional().isIn(EMPLOYMENT_STATUSES),
  query("taxTreatment").optional().isIn(EMPLOYER_TAX_TREATMENTS),
  query("year").optional().isInt({ min: 2000, max: 2100 }),
];

export const employerIdParamValidation = [param("id").notEmpty()];

export const createIncomeHistoryValidation = [
  param("id").notEmpty(),
  check("period").matches(/^\d{4}-\d{2}$/),
  check("gross").isFloat({ gt: 0 }),
  check("taxDeducted").optional().isFloat({ min: 0 }),
  check("pension").optional().isFloat({ min: 0 }),
  check("includesBonus").optional().isBoolean(),
];

export const listIncomeHistoryValidation = [
  param("id").notEmpty(),
  query("year").optional().isInt({ min: 2000, max: 2100 }),
];

export const listEmployerDocumentsValidation = [
  param("id").notEmpty(),
  query("q").optional().isString(),
  query("status").optional().isIn(["MISSING", "LINKED"]),
];

export const linkEmployerDocumentValidation = [
  param("id").notEmpty(),
  check("documentId").optional().isString(),
  check("title").optional().isString(),
  check("kind").optional().isString(),
  check("url").trim().notEmpty().isURL(),
  check("date").optional().matches(/^\d{4}-\d{2}-\d{2}$/),
];

export const patchEmployerDocumentValidation = [
  param("id").notEmpty(),
  param("documentId").notEmpty(),
  check("url").optional().isURL(),
  check("date").optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  check("title").optional().isString(),
];

export const deleteEmployerDocumentValidation = [
  param("id").notEmpty(),
  param("documentId").notEmpty(),
];
