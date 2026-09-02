/** Payroll statutory obligation types and status (Payroll & Employee Module API). */
export const OBLIGATION_TYPE = {
  PAYE: "PAYE",
  NHF: "NHF",
  PENSION: "PENSION",
} as const;

export type ObligationType =
  (typeof OBLIGATION_TYPE)[keyof typeof OBLIGATION_TYPE];

export const OBLIGATION_STATUS = {
  PAID: "PAID",
  PENDING: "PENDING",
} as const;

export type ObligationStatus =
  (typeof OBLIGATION_STATUS)[keyof typeof OBLIGATION_STATUS];

export const PAYE_COLLECTING_AUTHORITY_DEFAULT =
  "Lagos State Internal Revenue Service";
export const NHF_COLLECTING_AUTHORITY = "Federal Mortgage Bank of Nigeria";
export const NHF_LEGAL_BASIS = "National Housing Fund Act";
export const PENSION_REGULATORY_BASIS = "Pension Reform Act";
export const REMITTANCE_METHOD_DEFAULT = "Bank Transfer";

/** YYYY-MM */
export const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export function payrollPeriodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function payrollPeriodKeyFromDate(d: Date): string {
  return payrollPeriodKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

export function currentPayrollPeriodKey(now = new Date()): string {
  return payrollPeriodKey(now.getFullYear(), now.getMonth() + 1);
}

/** Employee counts toward payroll obligations from their start month onward. */
export function isEmployeeActiveInPayrollPeriod(
  startDate: Date,
  periodKey: string,
): boolean {
  if (!PERIOD_REGEX.test(periodKey)) return false;
  return payrollPeriodKeyFromDate(startDate) <= periodKey;
}
