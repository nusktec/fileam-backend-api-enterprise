/**
 * Registered long-term liability categories (Liability Register / repayments).
 * Display labels align with Financial Position non-current liability names.
 */
export const LIABILITY_TYPES = [
  "BANK_LOAN",
  "DIRECTOR_LOAN",
  "SHAREHOLDER_LOAN",
  "MORTGAGE",
  "EQUIPMENT_FINANCING",
  "LEASE_LIABILITY",
  "CONVERTIBLE_LOAN",
  "OTHER_LONG_TERM_BORROWING",
] as const;

export type LiabilityType = (typeof LIABILITY_TYPES)[number];

export const LIABILITY_TYPE_LABELS: Record<LiabilityType, string> = {
  BANK_LOAN: "Bank Loan",
  DIRECTOR_LOAN: "Director Loan",
  SHAREHOLDER_LOAN: "Shareholder Loan",
  MORTGAGE: "Mortgage",
  EQUIPMENT_FINANCING: "Equipment Financing",
  LEASE_LIABILITY: "Lease Liability",
  CONVERTIBLE_LOAN: "Convertible Loan",
  OTHER_LONG_TERM_BORROWING: "Other Long-term Borrowings",
};

/** Financial Position / liability dashboard display name → enum */
export const LIABILITY_LABEL_TO_TYPE: Record<string, LiabilityType> = {
  "Bank Loan": "BANK_LOAN",
  "Director Loan": "DIRECTOR_LOAN",
  "Shareholder Loan": "SHAREHOLDER_LOAN",
  Mortgage: "MORTGAGE",
  "Equipment Financing": "EQUIPMENT_FINANCING",
  "Lease Liability": "LEASE_LIABILITY",
  "Convertible Loan": "CONVERTIBLE_LOAN",
  "Other Long-term Borrowings": "OTHER_LONG_TERM_BORROWING",
};

export function isValidLiabilityType(value: string): value is LiabilityType {
  return (LIABILITY_TYPES as readonly string[]).includes(value);
}

export const LIABILITY_PAYMENT_SOURCES = ["CASH", "BANK"] as const;
export type LiabilityPaymentSource =
  (typeof LIABILITY_PAYMENT_SOURCES)[number];

export function isValidLiabilityPaymentSource(
  value: string,
): value is LiabilityPaymentSource {
  return (LIABILITY_PAYMENT_SOURCES as readonly string[]).includes(value);
}

export const LIABILITY_REPAYMENT_TYPES = ["FULL", "PARTIAL"] as const;
export type LiabilityRepaymentType =
  (typeof LIABILITY_REPAYMENT_TYPES)[number];

export const LIABILITY_PAYMENT_STATUSES = [
  "PENDING",
  "PARTIALLY_PAID",
  "FULLY_PAID",
] as const;
export type LiabilityPaymentStatus =
  (typeof LIABILITY_PAYMENT_STATUSES)[number];

export const LIABILITY_REPAYMENT_FREQUENCIES = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMI_ANNUALLY",
  "ANNUALLY",
  "CUSTOM",
] as const;
export type LiabilityRepaymentFrequency =
  (typeof LIABILITY_REPAYMENT_FREQUENCIES)[number];

export function isValidRepaymentFrequency(
  value: string,
): value is LiabilityRepaymentFrequency {
  return (LIABILITY_REPAYMENT_FREQUENCIES as readonly string[]).includes(value);
}

export const LIABILITY_REPAYMENT_STRUCTURES = [
  "AMORTIZED",
  "INTEREST_ONLY",
  "BULLET",
  "CUSTOM",
] as const;
export type LiabilityRepaymentStructure =
  (typeof LIABILITY_REPAYMENT_STRUCTURES)[number];

export function isValidRepaymentStructure(
  value: string,
): value is LiabilityRepaymentStructure {
  return (LIABILITY_REPAYMENT_STRUCTURES as readonly string[]).includes(value);
}

export const LIABILITY_INTEREST_RATE_TYPES = [
  "ANNUAL",
  "MONTHLY",
  "QUARTERLY",
  "WEEKLY",
  "DAILY",
  "CUSTOM",
] as const;
export type LiabilityInterestRateType =
  (typeof LIABILITY_INTEREST_RATE_TYPES)[number];

export function isValidInterestRateType(
  value: string,
): value is LiabilityInterestRateType {
  return (LIABILITY_INTEREST_RATE_TYPES as readonly string[]).includes(value);
}

export const LIABILITY_INTEREST_CALC_METHODS = [
  "FLAT",
  "REDUCING_BALANCE",
  "COMPOUNDING",
  "CUSTOM",
] as const;
export type LiabilityInterestCalcMethod =
  (typeof LIABILITY_INTEREST_CALC_METHODS)[number];

export function isValidInterestCalcMethod(
  value: string,
): value is LiabilityInterestCalcMethod {
  return (LIABILITY_INTEREST_CALC_METHODS as readonly string[]).includes(value);
}

export const LIABILITY_CLASS = {
  CURRENT: "CURRENT",
  NON_CURRENT: "NON_CURRENT",
  MIXED: "MIXED",
} as const;

export const TAX_GPT_TREATMENT = {
  PRINCIPAL_REDUCTION_AND_INTEREST_EXPENSE:
    "PRINCIPAL_REDUCTION_AND_INTEREST_EXPENSE",
  PRINCIPAL_REDUCTION_ONLY: "PRINCIPAL_REDUCTION_ONLY",
} as const;

/** Horizon (months) for current-portion classification. */
export const LIABILITY_CURRENT_PORTION_MONTHS = 12;
