import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import {
  ADVANCE_TYPES,
  INCOME_TYPES,
  INVESTMENT_TYPES,
  RECIPIENT_TYPES,
  REFUND_METHODS,
  REPAYMENT_METHODS,
  REPAYMENT_SCHEDULES,
  SUPPLIER_REFUND_REASONS,
  TAX_RECEIVABLE_STATUSES,
  TAX_REFUND_REASONS,
  TAX_TYPES,
} from "../../constants/receivables";

export const fixedAssetSaleReceivableValidation = [
  check("assetId").trim().notEmpty(),
  check("partyName").trim().notEmpty(),
  check("phone").trim().notEmpty(),
  check("address").trim().notEmpty(),
  check("salePrice").isFloat({ gt: 0 }),
  check("paymentDueDate").matches(/^\d{4}-\d{2}-\d{2}$/),
  check("email").optional().isEmail(),
  check("amountReceived").optional().isFloat({ min: 0 }),
  check("notes").optional().trim(),
  handleValidation,
];

export const supplierRefundReceivableValidation = [
  check("supplierId").trim().notEmpty(),
  check("reason").isIn([...SUPPLIER_REFUND_REASONS]),
  check("originalInvoiceAmount").isFloat({ gt: 0 }),
  check("amountPaid").isFloat({ gt: 0 }),
  check("refundAmountExpected").isFloat({ gt: 0 }),
  check("expectedRefundDate").matches(/^\d{4}-\d{2}-\d{2}$/),
  check("refundMethod").isIn([...REFUND_METHODS]),
  check("amountAlreadyRefunded").optional().isFloat({ min: 0 }),
  check("notes").optional().trim(),
  handleValidation,
];

export const employeeDirectorAdvanceValidation = [
  check("recipientType").isIn([...RECIPIENT_TYPES]),
  check("employeeId").optional().trim(),
  check("recipientName").optional().trim(),
  check("advanceType").isIn([...ADVANCE_TYPES]),
  check("amountAdvanced").isFloat({ gt: 0 }),
  check("dateAdvanced").matches(/^\d{4}-\d{2}-\d{2}$/),
  check("expectedSettlementDate").matches(/^\d{4}-\d{2}-\d{2}$/),
  check("repaymentMethod").isIn([...REPAYMENT_METHODS]),
  check("repaymentSchedule").isIn([...REPAYMENT_SCHEDULES]),
  check("purpose").trim().notEmpty(),
  handleValidation,
];

export const taxRefundReceivableValidation = [
  check("taxAuthority").trim().notEmpty(),
  check("taxType").isIn([...TAX_TYPES]),
  check("taxPeriod").trim().notEmpty(),
  check("filingReference").trim().notEmpty(),
  check("reason").isIn([...TAX_REFUND_REASONS]),
  check("refundCreditAmount").isFloat({ gt: 0 }),
  check("expectedRefundDate").matches(/^\d{4}-\d{2}-\d{2}$/),
  check("status").isIn([...TAX_RECEIVABLE_STATUSES]),
  check("evidenceUrl").optional().trim(),
  check("amountAlreadyReceived").optional().isFloat({ min: 0 }),
  handleValidation,
];

export const investmentIncomeReceivableValidation = [
  check("investmentName").trim().notEmpty(),
  check("investmentType").isIn([...INVESTMENT_TYPES]),
  check("investmentAccountReference").trim().notEmpty(),
  check("incomeType").isIn([...INCOME_TYPES]),
  check("principalAmount").isFloat({ gt: 0 }),
  check("incomeAmount").isFloat({ gt: 0 }),
  check("incomeAccrualDate").matches(/^\d{4}-\d{2}-\d{2}$/),
  check("paymentDueDate").matches(/^\d{4}-\d{2}-\d{2}$/),
  check("payerEntity").trim().notEmpty(),
  check("referenceNumber").trim().notEmpty(),
  check("whtCreditNoteAvailable").isBoolean(),
  check("amountReceived").optional().isFloat({ min: 0 }),
  check("whtDeducted").optional().isFloat({ min: 0 }),
  handleValidation,
];
