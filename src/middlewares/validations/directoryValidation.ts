import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import {
  CUSTOMER_DOCUMENT_TYPES,
  SUPPLIER_DOCUMENT_TYPES,
} from "../../constants/directory";

export const createCustomerValidation = [
  check("name").trim().notEmpty().withMessage("name is required"),
  check("phone").trim().notEmpty().withMessage("phone is required"),
  check("address").trim().notEmpty().withMessage("address is required"),
  check("businessName").optional().trim().isString(),
  check("email").optional().trim().isEmail().withMessage("email must be valid"),
  check("tin").optional().trim().isString(),
  handleValidation,
];

export const updateCustomerValidation = [
  check("name").optional().trim().notEmpty(),
  check("phone").optional().trim().notEmpty(),
  check("address").optional().trim().notEmpty(),
  check("businessName").optional({ nullable: true }).trim().isString(),
  check("email").optional({ nullable: true }).trim().isEmail(),
  check("tin").optional({ nullable: true }).trim().isString(),
  handleValidation,
];

export const uploadCustomerDocumentValidation = [
  check("saleId").trim().notEmpty().withMessage("saleId is required"),
  check("type")
    .trim()
    .isIn([...CUSTOMER_DOCUMENT_TYPES])
    .withMessage(`type must be one of: ${CUSTOMER_DOCUMENT_TYPES.join(", ")}`),
  check("url").trim().notEmpty().withMessage("url is required"),
  handleValidation,
];

export const createSupplierValidation = [
  check("name").trim().notEmpty().withMessage("name is required"),
  check("phone").trim().notEmpty().withMessage("phone is required"),
  check("address").trim().notEmpty().withMessage("address is required"),
  check("businessName").optional().trim().isString(),
  check("email").optional().trim().isEmail().withMessage("email must be valid"),
  check("contactPerson").optional().trim().isString(),
  check("tin").optional().trim().isString(),
  handleValidation,
];

export const updateSupplierValidation = [
  check("name").optional().trim().notEmpty(),
  check("phone").optional().trim().notEmpty(),
  check("address").optional().trim().notEmpty(),
  check("businessName").optional({ nullable: true }).trim().isString(),
  check("email").optional({ nullable: true }).trim().isEmail(),
  check("contactPerson").optional({ nullable: true }).trim().isString(),
  check("tin").optional({ nullable: true }).trim().isString(),
  handleValidation,
];

export const uploadSupplierDocumentValidation = [
  check("expenseId").trim().notEmpty().withMessage("expenseId is required"),
  check("type")
    .trim()
    .isIn([...SUPPLIER_DOCUMENT_TYPES])
    .withMessage(`type must be one of: ${SUPPLIER_DOCUMENT_TYPES.join(", ")}`),
  check("url").trim().notEmpty().withMessage("url is required"),
  handleValidation,
];
