import { body, check, param, query } from "express-validator";
import {
  PAYER_BENEFICIARY_TYPES,
  PAYER_ENTITY_TYPES,
  PAYER_INCOME_CATEGORIES,
  PAYER_LIST_FILTERS,
  PAYER_PAYMENT_PURPOSES,
  PAYER_PAYMENT_TYPES,
  PAYER_SETTLEMENT_PAYMENT_TYPES,
  PAYER_TRANSACTION_STATUSES,
  PAYER_DOCUMENT_KINDS,
} from "../../constants/payer";

export const createPayerValidation = [
  check("entityType").isIn(PAYER_ENTITY_TYPES),
  check("fullName").trim().notEmpty(),
  check("category").isIn(PAYER_INCOME_CATEGORIES),
  check("companyName").optional({ nullable: true }).isString(),
  check("tin").optional({ nullable: true }).isString(),
  check("vatApplicable").optional().isBoolean(),
  check("whtApplicable").optional().isBoolean(),
  check("phone").optional({ nullable: true }).isString(),
  check("email").optional({ nullable: true }).isEmail(),
  check("address").optional({ nullable: true }).isString(),
  check("bankName").optional({ nullable: true }).isString(),
  check("bankAccount").optional({ nullable: true }).isString(),
  check("beneficiary").optional({ nullable: true }).isIn(PAYER_BENEFICIARY_TYPES),
  check("evidence.url").optional().isString(),
  check("evidence.name").optional().isString(),
];

export const updatePayerValidation = [
  param("id").isUUID(),
  check("entityType").optional().isIn(PAYER_ENTITY_TYPES),
  check("fullName").optional().trim().notEmpty(),
  check("category").optional().isIn(PAYER_INCOME_CATEGORIES),
  check("companyName").optional({ nullable: true }).isString(),
  check("tin").optional({ nullable: true }).isString(),
  check("vatApplicable").optional().isBoolean(),
  check("whtApplicable").optional().isBoolean(),
  check("phone").optional({ nullable: true }).isString(),
  check("email").optional({ nullable: true }).isEmail(),
  check("address").optional({ nullable: true }).isString(),
  check("bankName").optional({ nullable: true }).isString(),
  check("bankAccount").optional({ nullable: true }).isString(),
  check("beneficiary").optional({ nullable: true }).isIn(PAYER_BENEFICIARY_TYPES),
];

export const listPayersValidation = [
  query("status").optional().isIn(PAYER_LIST_FILTERS),
  query("search").optional().isString(),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
];

export const payerIdParamValidation = [param("id").isUUID()];

export const createPayerTransactionValidation = [
  param("id").isUUID(),
  check("date").matches(/^\d{4}-\d{2}-\d{2}$/),
  check("amount").isFloat({ gt: 0 }),
  check("paymentType").isIn(PAYER_PAYMENT_TYPES),
  check("invoiceDueDate").optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}$/),
  check("purpose").isIn(PAYER_PAYMENT_PURPOSES),
  check("paymentReference").optional().isString(),
  check("notes").optional().isString(),
];

export const listPayerTransactionsValidation = [
  param("id").isUUID(),
  query("search").optional().isString(),
  query("status").optional().isIn(PAYER_TRANSACTION_STATUSES),
];

export const recordPayerInvoicePaymentValidation = [
  param("id").isUUID(),
  param("transactionId").isUUID(),
  check("amount").isFloat({ gt: 0 }),
  check("paymentType").isIn(PAYER_SETTLEMENT_PAYMENT_TYPES),
];

export const createPayerDocumentValidation = [
  param("id").isUUID(),
  check("title").trim().notEmpty(),
  check("kind").optional().isIn(PAYER_DOCUMENT_KINDS),
  check("url").trim().notEmpty().isURL(),
  check("date").optional().matches(/^\d{4}-\d{2}-\d{2}$/),
];

export const listPayerDocumentsValidation = [
  param("id").isUUID(),
  query("search").optional().isString(),
];
