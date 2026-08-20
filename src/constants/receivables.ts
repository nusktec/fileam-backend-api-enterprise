export const RECEIVABLE_TYPES = {
  FIXED_ASSET_SALE_ON_CREDIT: "FIXED_ASSET_SALE_ON_CREDIT",
  SUPPLIER_REFUND_OVERPAYMENT: "SUPPLIER_REFUND_OVERPAYMENT",
  EMPLOYEE_DIRECTOR_ADVANCE: "EMPLOYEE_DIRECTOR_ADVANCE",
  TAX_REFUND_VAT_CREDIT: "TAX_REFUND_VAT_CREDIT",
  INVESTMENT_INCOME_OWED: "INVESTMENT_INCOME_OWED",
} as const;

export type ReceivableType =
  (typeof RECEIVABLE_TYPES)[keyof typeof RECEIVABLE_TYPES];

export const SUPPLIER_REFUND_REASONS = [
  "RETURNED_GOODS",
  "DEFECTIVE_GOODS",
  "OVERPAYMENT",
  "DUPLICATE_PAYMENT",
  "PRICE_ADJUSTMENT",
  "OTHER",
] as const;

export const REFUND_METHODS = [
  "BANK_TRANSFER",
  "CASH",
  "CHEQUE",
  "CREDIT_NOTE",
  "OTHER",
] as const;

export const RECIPIENT_TYPES = [
  "EMPLOYEE",
  "DIRECTOR",
  "EXECUTIVE",
  "OTHER",
] as const;

export const ADVANCE_TYPES = [
  "SALARY_ADVANCE",
  "TRAVEL_BUSINESS_ADVANCE",
  "EMPLOYEE_LOAN",
  "DIRECTOR_LOAN",
  "OTHER_ADVANCE",
] as const;

export const REPAYMENT_METHODS = [
  "SALARY_DEDUCTION",
  "BANK_TRANSFER",
  "CASH",
  "OTHER",
] as const;

export const REPAYMENT_SCHEDULES = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMI_ANNUALLY",
  "ANNUALLY",
  "ONE_TIME",
] as const;

export const TAX_TYPES = ["CIT", "PIT", "VAT", "WHT", "OTHER"] as const;

export const TAX_REFUND_REASONS = [
  "TAX_OVERPAYMENT",
  "VAT_INPUT_CREDIT",
  "TAX_REFUND",
  "OTHER_CREDIT",
] as const;

export const TAX_RECEIVABLE_STATUSES = [
  "CLAIMED",
  "UNDER_REVIEW",
  "APPROVED",
  "PARTIALLY_UTILISED",
  "REFUNDED",
  "REJECTED",
] as const;

export const INVESTMENT_TYPES = [
  "FIXED_DEPOSIT",
  "SHARES",
  "AFFILIATE_INVESTMENT",
  "BOND",
  "OTHER",
] as const;

export const INCOME_TYPES = [
  "INTEREST",
  "DIVIDEND",
  "OTHER_INVESTMENT_INCOME",
] as const;

export const RECEIVABLE_SETTLEMENT_STATUSES = {
  PENDING: "PENDING",
  PARTIAL: "PARTIAL",
  PAID: "PAID",
} as const;

export function settlementStatus(
  gross: number,
  received: number,
): "PENDING" | "PARTIAL" | "PAID" {
  if (received <= 0) return "PENDING";
  if (received >= gross) return "PAID";
  return "PARTIAL";
}
