import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import { PREPAYMENT_RECOGNITION_FREQUENCIES } from "../../constants/prepayment";

export const createPrepaymentValidation = [
  check("category").trim().notEmpty().withMessage("category is required"),
  check("description").trim().notEmpty().withMessage("description is required"),
  check("supplier.id").trim().notEmpty().withMessage("supplier.id is required"),
  check("supplier.name").trim().notEmpty().withMessage("supplier.name is required"),
  check("totalAmount")
    .isFloat({ gt: 0 })
    .withMessage("totalAmount must be greater than 0"),
  check("paymentDate")
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("paymentDate must be YYYY-MM-DD"),
  check("serviceStartDate")
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("serviceStartDate must be YYYY-MM-DD"),
  check("serviceEndDate")
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("serviceEndDate must be YYYY-MM-DD"),
  check("recognitionFrequency")
    .trim()
    .isIn([...PREPAYMENT_RECOGNITION_FREQUENCIES])
    .withMessage(
      `recognitionFrequency must be one of: ${PREPAYMENT_RECOGNITION_FREQUENCIES.join(", ")}`,
    ),
  check("expenseType").trim().notEmpty().withMessage("expenseType is required"),
  check("evidenceUrl").trim().notEmpty().withMessage("evidenceUrl is required"),
  check("customSchedule").optional().isArray(),
  check("customSchedule.*.recognitionDate")
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/),
  check("customSchedule.*.amount").optional().isFloat({ gt: 0 }),
  handleValidation,
];

export const updatePrepaymentValidation = [
  check("category").optional().trim().notEmpty(),
  check("description").optional().trim().notEmpty(),
  check("supplier.id").optional().trim().notEmpty(),
  check("supplier.name").optional().trim().notEmpty(),
  check("serviceStartDate").optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  check("serviceEndDate").optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  check("recognitionFrequency")
    .optional()
    .isIn([...PREPAYMENT_RECOGNITION_FREQUENCIES]),
  check("expenseType").optional().trim().notEmpty(),
  handleValidation,
];

export const assignPrepaymentConsultantValidation = [
  check("consultantId").trim().notEmpty().withMessage("consultantId is required"),
  check("consultantName")
    .trim()
    .notEmpty()
    .withMessage("consultantName is required"),
  handleValidation,
];

export const addPrepaymentEvidenceValidation = [
  check("url").trim().notEmpty().withMessage("url is required"),
  handleValidation,
];

export const cancelPrepaymentValidation = [
  check("reason").trim().notEmpty().withMessage("reason is required"),
  handleValidation,
];
