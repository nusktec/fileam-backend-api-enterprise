import { body, check, param, query } from "express-validator";
import {
  BENEFICIARY_DOCUMENT_KINDS,
  BENEFICIARY_ENTITY_TYPES,
  BENEFICIARY_ENTRY_TYPES,
  BENEFICIARY_LIST_FILTERS,
  BENEFICIARY_RESIDENCY,
  BENEFICIARY_TYPES,
  PARTY_TYPES,
  VENDOR_CATEGORIES,
  WHT_CLASSES,
} from "../../constants/beneficiary";

export const listBeneficiariesValidation = [
  query("type").optional().isIn(BENEFICIARY_LIST_FILTERS),
  query("search").optional().isString(),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
];

export const beneficiaryIdParamValidation = [param("id").isUUID()];

export const beneficiaryTransactionIdParamValidation = [
  param("id").isUUID(),
  param("transactionId").isUUID(),
];

const beneficiaryProfileValidation = [
  check("name").trim().notEmpty(),
  check("beneficiaryType").isIn(BENEFICIARY_TYPES),
  check("vendorCategory")
    .optional({ nullable: true })
    .isIn(VENDOR_CATEGORIES),
  check("partyType").optional({ nullable: true }).isIn(PARTY_TYPES),
  check("entityType").isIn(BENEFICIARY_ENTITY_TYPES),
  check("residency").isIn(BENEFICIARY_RESIDENCY),
  check("whtApplicable").isBoolean(),
  check("tin").optional({ nullable: true }).isString(),
  check("phone").optional({ nullable: true }).isString(),
  check("email").optional({ nullable: true }).isEmail(),
  check("address").optional({ nullable: true }).isString(),
  check("bankName").optional({ nullable: true }).isString(),
  check("accountNumber").optional({ nullable: true }).isString(),
];

export const createBeneficiaryValidation = beneficiaryProfileValidation;

export const updateBeneficiaryValidation = [
  param("id").isUUID(),
  ...beneficiaryProfileValidation,
];

export const createBeneficiaryTransactionValidation = [
  param("id").isUUID(),
  check("entryType").isIn(BENEFICIARY_ENTRY_TYPES),
  check("description").optional({ nullable: true }).isString(),
  check("date").matches(/^\d{4}-\d{2}-\d{2}$/),
  check("grossAmount").isFloat({ gt: 0 }),
  check("whtClass").optional().isIn(WHT_CLASSES),
  check("invoiceNumber").optional().isString(),
  check("invoiceId").optional().isUUID(),
  check("whtRateOverride").optional().isBoolean(),
  check("whtRate").optional().isFloat({ min: 0, max: 100 }),
  check("whtOverrideReason").optional().isString(),
  check("reference").optional().isString(),
];

export const remitBeneficiaryWhtValidation = [
  param("id").isUUID(),
  param("transactionId").isUUID(),
  check("remittedAt").optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  check("receiptUrl").optional().isString(),
];

export const createBeneficiaryDocumentValidation = [
  param("id").isUUID(),
  check("title").trim().notEmpty(),
  check("kind").isIn(BENEFICIARY_DOCUMENT_KINDS),
  check("url").trim().notEmpty().isURL(),
  check("date").optional().matches(/^\d{4}-\d{2}-\d{2}$/),
];
