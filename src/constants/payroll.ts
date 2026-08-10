import { PAYE_CONSOLIDATED_RELIEF_MIN_RATE, PERCENT } from "./percentages";

/** Nigerian payroll constants (simplified). Pension: employee 8%, employer 10%. NHF 2.5%. */
export const PENSION_EMPLOYEE_RATE = 8;
export const PENSION_EMPLOYER_RATE = 10;
export const NHF_RATE = 2.5;
export const PAYE_DUE_DAY = 10;

/** Cap on allowable annual house rent relief (NGN). */
export const HOUSE_RENT_RELIEF_CAP = 500_000;
/** Fraction of actual annual rent allowed as relief before the cap. */
export const HOUSE_RENT_RELIEF_RATE = 0.2;

/** Optional annual relief inputs stored on the employee record. */
export type PayeReliefInputs = {
  annualHouseRent?: number;
  nhisHealthInsurance?: number;
  lifeAssurancePremium?: number;
  mortgageInterest?: number;
  qualifyingMedicalExpenses?: number;
};

/** Annual taxable income brackets (NGN) and rate. Simplified PAYE. */
const PAYE_BRACKETS: { limit: number; rate: number }[] = [
  { limit: 300_000, rate: 7 },
  { limit: 600_000, rate: 11 },
  { limit: 1_100_000, rate: 15 },
  { limit: 1_600_000, rate: 19 },
  { limit: 3_200_000, rate: 21 },
  { limit: Infinity, rate: 24 },
];

function nonNegative(n: number | undefined | null): number {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

/**
 * Rent Relief = MIN(20% × Annual House Rent, ₦500,000).
 * `annualHouseRent` is actual rent paid — not the relief amount.
 */
export function computeHouseRentRelief(annualHouseRent: number): number {
  const rent = nonNegative(annualHouseRent);
  return Math.min(rent * HOUSE_RENT_RELIEF_RATE, HOUSE_RENT_RELIEF_CAP);
}

/** Sum of annual reliefs deducted before PAYE banding (excludes CRA + pension). */
export function computeAnnualPayeReliefs(reliefs?: PayeReliefInputs): {
  houseRentRelief: number;
  nhisHealthInsurance: number;
  lifeAssurancePremium: number;
  mortgageInterest: number;
  qualifyingMedicalExpenses: number;
  totalAdditionalReliefs: number;
} {
  const houseRentRelief = computeHouseRentRelief(reliefs?.annualHouseRent ?? 0);
  const nhisHealthInsurance = nonNegative(reliefs?.nhisHealthInsurance);
  const lifeAssurancePremium = nonNegative(reliefs?.lifeAssurancePremium);
  const mortgageInterest = nonNegative(reliefs?.mortgageInterest);
  const qualifyingMedicalExpenses = nonNegative(
    reliefs?.qualifyingMedicalExpenses,
  );
  return {
    houseRentRelief,
    nhisHealthInsurance,
    lifeAssurancePremium,
    mortgageInterest,
    qualifyingMedicalExpenses,
    totalAdditionalReliefs:
      houseRentRelief +
      nhisHealthInsurance +
      lifeAssurancePremium +
      mortgageInterest +
      qualifyingMedicalExpenses,
  };
}

/**
 * Monthly PAYE from annual gross employment income.
 * Applies CRA, employee pension deduction, and optional statutory reliefs.
 */
export function computePayeMonthly(
  grossAnnual: number,
  reliefs?: PayeReliefInputs,
): number {
  const consolidatedRelief = Math.max(
    grossAnnual * PAYE_CONSOLIDATED_RELIEF_MIN_RATE,
    200_000,
  );
  const pensionDeduction = grossAnnual * (PENSION_EMPLOYEE_RATE / PERCENT);
  const { totalAdditionalReliefs } = computeAnnualPayeReliefs(reliefs);
  const taxableAnnual = Math.max(
    0,
    grossAnnual - pensionDeduction - consolidatedRelief - totalAdditionalReliefs,
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
