export const TAX_TYPES = ["VAT", "WHT", "CIT", "PIT", "PAYE"] as const;
export type TaxType = (typeof TAX_TYPES)[number];

export const PAYABLE_STATUS = [
  "pending",
  "paid",
  "overpaid",
  "partially_paid",
] as const;
export type PayableStatus = (typeof PAYABLE_STATUS)[number];

export const PAYMENT_RECORD_STATUS = [
  "pending",
  "completed",
  "failed",
  "refunded",
] as const;
export type PaymentRecordStatus = (typeof PAYMENT_RECORD_STATUS)[number];

export const PAYMENT_METHODS = ["card", "bank_transfer", "cash"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** VAT filing due: 21st of the month following the tax period (e.g. Feb period -> due Mar 21) */
export const VAT_FILING_DAY = 21;

/**
 * Explains book-sync vs PAYE when salary is captured on the user profile.
 */
export const TAX_PAYABLES_SCOPE_NOTE =
  "Payable rows sync VAT, WHT, CIT, and PIT from book estimates. PAYE uses employee salary components (Universal Nigeria PAYE 2026) when employees exist; optional employmentGrossSalaryMonthly on profile is a legacy fallback only.";
