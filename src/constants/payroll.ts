import { PAYE_CONSOLIDATED_RELIEF_MIN_RATE, PERCENT } from "./percentages";

/** Nigerian payroll constants (simplified). Pension: employee 8%, employer 10%. NHF 2.5%. */
export const PENSION_EMPLOYEE_RATE = 8;
export const PENSION_EMPLOYER_RATE = 10;
export const NHF_RATE = 2.5;
export const PAYE_DUE_DAY = 10;

/** Annual taxable income brackets (NGN) and rate. Simplified PAYE. */
const PAYE_BRACKETS: { limit: number; rate: number }[] = [
  { limit: 300_000, rate: 7 },
  { limit: 600_000, rate: 11 },
  { limit: 1_100_000, rate: 15 },
  { limit: 1_600_000, rate: 19 },
  { limit: 3_200_000, rate: 21 },
  { limit: Infinity, rate: 24 },
];

export function computePayeMonthly(grossAnnual: number): number {
  const consolidatedRelief = Math.max(
    grossAnnual * PAYE_CONSOLIDATED_RELIEF_MIN_RATE,
    200_000,
  );
  const pensionDeduction = grossAnnual * (PENSION_EMPLOYEE_RATE / PERCENT);
  const taxableAnnual = Math.max(
    0,
    grossAnnual - pensionDeduction - consolidatedRelief,
  );
  if (taxableAnnual <= 0) return 0;
  let tax = 0;
  let prevLimit = 0;
  for (const b of PAYE_BRACKETS) {
    if (taxableAnnual <= prevLimit) break;
    const band = Math.min(taxableAnnual - prevLimit, b.limit - prevLimit);
    tax += (band * b.rate) / PERCENT;
    prevLimit = b.limit;
    if (taxableAnnual <= b.limit) break;
  }
  return tax / 12;
}

export function computePensionEmployee(grossMonthly: number): number {
  return (grossMonthly * PENSION_EMPLOYEE_RATE) / PERCENT;
}

export function computePensionEmployer(grossMonthly: number): number {
  return (grossMonthly * PENSION_EMPLOYER_RATE) / PERCENT;
}

export function computeNhf(basicMonthly: number): number {
  return (basicMonthly * NHF_RATE) / PERCENT;
}
