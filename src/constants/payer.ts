import { VAT_RATE_PERCENT, WHT_RATE_SERVICES_PERCENT } from "./percentages";

export const PAYER_ENTITY_TYPES = ["COMPANY", "INDIVIDUAL"] as const;
export type PayerEntityType = (typeof PAYER_ENTITY_TYPES)[number];

export const PAYER_INCOME_CATEGORIES = [
  "SALE_OF_GOODS",
  "PROVISION_OF_SERVICES",
  "PROFESSIONAL_CONSULTANCY",
  "CONTRACT_PROJECT",
  "COMMISSION_BROKERAGE",
  "RENT_LEASE",
  "INTEREST_INCOME",
  "DIVIDEND_INCOME",
  "OTHER_BUSINESS",
] as const;
export type PayerIncomeCategory = (typeof PAYER_INCOME_CATEGORIES)[number];

export const PAYER_BENEFICIARY_TYPES = [
  "BUSINESS_CLIENT",
  "INDIVIDUAL_CLIENT",
  "RELATED_PARTY",
  "GOVERNMENT",
] as const;
export type PayerBeneficiaryType = (typeof PAYER_BENEFICIARY_TYPES)[number];

export const PAYER_STATUSES = ["OVERDUE", "AR_BALANCE", "CLEARED"] as const;
export type PayerStatus = (typeof PAYER_STATUSES)[number];

export const PAYER_LIST_FILTERS = ["ALL", "AR_BALANCE", "OVERDUE"] as const;
export type PayerListFilter = (typeof PAYER_LIST_FILTERS)[number];

export const PAYER_TRANSACTION_STATUSES = [
  "PAID",
  "OUTSTANDING",
  "OVERDUE",
  "VOID",
] as const;
export type PayerTransactionStatus = (typeof PAYER_TRANSACTION_STATUSES)[number];

export const PAYER_PAYMENT_PURPOSES = [
  "SALES",
  "LOAN_RECEIVED",
  "OWNER_CAPITAL_INTRODUCED",
  "EMPLOYEE_DIRECTOR_REPAYMENT",
  "VENDOR_REFUND",
  "INSURANCE_PROCEEDS",
  "TAX_REFUND",
  "INVESTMENT_INCOME",
  "ASSET_SALE",
  "OTHER_INCOME",
  "OTHER_RECEIPT",
] as const;
export type PayerPaymentPurpose = (typeof PAYER_PAYMENT_PURPOSES)[number];

export const PAYER_PAYMENT_TYPES = ["Cash", "Transfer", "Invoice", "Card"] as const;
export type PayerPaymentType = (typeof PAYER_PAYMENT_TYPES)[number];

export const PAYER_SETTLEMENT_PAYMENT_TYPES = ["Cash", "Transfer", "Card"] as const;

export const PAYER_DOCUMENT_KINDS = [
  "CONTRACT",
  "PURCHASE_ORDER",
  "WHT",
  "OTHER",
] as const;
export type PayerDocumentKind = (typeof PAYER_DOCUMENT_KINDS)[number];

export const PAYER_CATEGORY_LABELS: Record<PayerIncomeCategory, string> = {
  SALE_OF_GOODS: "Sale of Goods (Confirm VAT-able)",
  PROVISION_OF_SERVICES: "Provision of Services",
  PROFESSIONAL_CONSULTANCY: "Professional/Consultancy Services",
  CONTRACT_PROJECT: "Contract/Project Income",
  COMMISSION_BROKERAGE: "Commission/Brokerage Income",
  RENT_LEASE: "Rent/Lease Income",
  INTEREST_INCOME: "Interest Income",
  DIVIDEND_INCOME: "Dividend Income",
  OTHER_BUSINESS: "Other Business Income",
};

export const PAYER_PURPOSE_LABELS: Record<PayerPaymentPurpose, string> = {
  SALES: "Sales",
  LOAN_RECEIVED: "Loan Received",
  OWNER_CAPITAL_INTRODUCED: "Owner Capital Introduced",
  EMPLOYEE_DIRECTOR_REPAYMENT: "Employee/Director Repayment",
  VENDOR_REFUND: "Vendor Refund",
  INSURANCE_PROCEEDS: "Insurance Proceeds",
  TAX_REFUND: "Tax Refund",
  INVESTMENT_INCOME: "Investment Income",
  ASSET_SALE: "Asset Sale",
  OTHER_INCOME: "Other Income",
  OTHER_RECEIPT: "Other Receipt",
};

export const PAYER_DOCUMENT_CATEGORY_LABELS: Record<PayerDocumentKind, string> = {
  CONTRACT: "Contract",
  PURCHASE_ORDER: "Purchase Order",
  WHT: "Document",
  OTHER: "Document",
};

export function defaultPayerBeneficiary(
  entityType: PayerEntityType,
): PayerBeneficiaryType {
  return entityType === "COMPANY" ? "BUSINESS_CLIENT" : "INDIVIDUAL_CLIENT";
}

export function payerTaxDefaults(vatApplicable: boolean, whtApplicable: boolean) {
  return {
    vatRate: vatApplicable ? VAT_RATE_PERCENT : 0,
    whtRate: whtApplicable ? WHT_RATE_SERVICES_PERCENT : 0,
    whtNote: whtApplicable ? "deducted by payer" : "not applicable",
  };
}

export function resolvePayerDisplayName(input: {
  entityType: PayerEntityType;
  fullName: string;
  companyName?: string | null;
}): string {
  if (input.entityType === "COMPANY" && input.companyName?.trim()) {
    return input.companyName.trim();
  }
  return input.fullName.trim();
}

export function computePayerStatus(
  arBalance: number,
  overdueAmount: number,
): PayerStatus {
  if (overdueAmount > 0) return "OVERDUE";
  if (arBalance > 0) return "AR_BALANCE";
  return "CLEARED";
}

export const PAYER_INVOICE_COUNTER = "payer_invoice_counter";
