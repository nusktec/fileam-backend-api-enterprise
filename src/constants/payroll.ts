import { PERCENT } from "./percentages";
import { computeProgressivePitFromChargeableIncome } from "./pitTaxSchedule";

/** Nigerian payroll constants (NTA 2025). Pension: employee 8%, employer 10%. NHF 2.5% of basic. */
export const PENSION_EMPLOYEE_RATE = 8;
export const PENSION_EMPLOYER_RATE = 10;
export const NHF_RATE = 2.5;
export const PAYE_DUE_DAY = 10;

/** Cap on allowable annual house rent relief (NGN) — NTA 2025 s.30(2)(a)(vi). */
export const HOUSE_RENT_RELIEF_CAP = 500_000;
/** Fraction of actual annual rent allowed as relief before the cap. */
export const HOUSE_RENT_RELIEF_RATE = 0.2;

/** Statutory reliefs declared by the employee (NTA 2025 eligible deductions). */
export type PayeReliefInputs = {
  annualHouseRent?: number;
  nhisHealthInsurance?: number;
  lifeAssurancePremium?: number;
  mortgageInterest?: number;
  qualifyingMedicalExpenses?: number;
};

/** Inputs for PAYE on employment income under NTA 2025 (CRA abolished 1 Jan 2026). */
export type PayeComputationOptions = PayeReliefInputs & {
  /** Employee pension (annual). Default: 8% of grossAnnual. */
  pensionContributionAnnual?: number;
  /** Basic salary (annual) — used to derive NHF when nhfContributionAnnual is omitted. */
  basicAnnual?: number;
  /** When false, NHF is excluded from chargeable-income deductions. */
  nhfApplicable?: boolean;
  /** Explicit annual NHF (overrides basicAnnual × 2.5%). */
  nhfContributionAnnual?: number;
};

export type PayeComputationBreakdown = {
  grossAnnual: number;
  pensionDeduction: number;
  nhfDeduction: number;
  houseRentRelief: number;
  nhisHealthInsurance: number;
  lifeAssurancePremium: number;
  mortgageInterest: number;
  qualifyingMedicalExpenses: number;
  totalStatutoryReliefs: number;
  totalDeductions: number;
  chargeableIncome: number;
  annualPaye: number;
  monthlyPaye: number;
};

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

/** Sum of optional NTA 2025 reliefs (excludes pension and NHF). */
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
 * Annual PAYE under NTA 2025 Fourth Schedule.
 * Chargeable income = gross − pension − NHF − rent/NHIS/life assurance/mortgage/medical reliefs.
 * Consolidated Relief Allowance (CRA) is not applied.
 */
export function computeAnnualPaye(
  grossAnnual: number,
  opts?: PayeComputationOptions,
): PayeComputationBreakdown {
  const gross = nonNegative(grossAnnual);
  const pensionDeduction =
    opts?.pensionContributionAnnual != null
      ? nonNegative(opts.pensionContributionAnnual)
      : (gross * PENSION_EMPLOYEE_RATE) / PERCENT;

  const nhfApplicable = opts?.nhfApplicable !== false;
  let nhfDeduction = 0;
  if (nhfApplicable) {
    if (opts?.nhfContributionAnnual != null) {
      nhfDeduction = nonNegative(opts.nhfContributionAnnual);
    } else if (opts?.basicAnnual != null && opts.basicAnnual > 0) {
      nhfDeduction = (nonNegative(opts.basicAnnual) * NHF_RATE) / PERCENT;
    }
  }

  const statutoryReliefs = computeAnnualPayeReliefs(opts);
  const totalDeductions =
    pensionDeduction +
    nhfDeduction +
    statutoryReliefs.totalAdditionalReliefs;

  const chargeableIncome = Math.max(0, gross - totalDeductions);
  const annualPaye = computeProgressivePitFromChargeableIncome(chargeableIncome);

  return {
    grossAnnual: gross,
    pensionDeduction,
    nhfDeduction,
    houseRentRelief: statutoryReliefs.houseRentRelief,
    nhisHealthInsurance: statutoryReliefs.nhisHealthInsurance,
    lifeAssurancePremium: statutoryReliefs.lifeAssurancePremium,
    mortgageInterest: statutoryReliefs.mortgageInterest,
    qualifyingMedicalExpenses: statutoryReliefs.qualifyingMedicalExpenses,
    totalStatutoryReliefs: statutoryReliefs.totalAdditionalReliefs,
    totalDeductions,
    chargeableIncome,
    annualPaye,
    monthlyPaye: annualPaye / 12,
  };
}

/** Monthly PAYE from annual gross employment income (NTA 2025). */
export function computePayeMonthly(
  grossAnnual: number,
  opts?: PayeComputationOptions,
): number {
  return computeAnnualPaye(grossAnnual, opts).monthlyPaye;
}

/** Build PAYE options from monthly payroll figures (employees / payee run). */
/** Monthly pensionable emoluments — basic + housing + transport (Pension Reform Act). */
export function computePensionableMonthly(input: {
  basicMonthly: number;
  housingAllowanceMonthly?: number;
  transportAllowanceMonthly?: number;
}): number {
  return (
    nonNegative(input.basicMonthly) +
    nonNegative(input.housingAllowanceMonthly) +
    nonNegative(input.transportAllowanceMonthly)
  );
}

export function buildEmployeePayeOptions(input: {
  grossMonthly: number;
  basicMonthly: number;
  housingAllowanceMonthly?: number;
  transportAllowanceMonthly?: number;
  nhfApplicable?: boolean;
  employeeContributesNhf?: boolean;
  pensionMonthly?: number;
  reliefs?: PayeReliefInputs;
}): PayeComputationOptions {
  const grossMonthly = nonNegative(input.grossMonthly);
  const basicMonthly = nonNegative(input.basicMonthly);
  const pensionableMonthly = computePensionableMonthly({
    basicMonthly,
    housingAllowanceMonthly: input.housingAllowanceMonthly,
    transportAllowanceMonthly: input.transportAllowanceMonthly,
  });
  const pensionMonthly =
    input.pensionMonthly != null
      ? nonNegative(input.pensionMonthly)
      : (pensionableMonthly * PENSION_EMPLOYEE_RATE) / PERCENT;
  const nhfOn =
    input.nhfApplicable !== false && input.employeeContributesNhf !== false;

  return {
    ...input.reliefs,
    pensionContributionAnnual: pensionMonthly * 12,
    basicAnnual: basicMonthly * 12,
    nhfApplicable: nhfOn && basicMonthly > 0,
  };
}

export function computePensionEmployee(pensionableMonthly: number): number {
  return (pensionableMonthly * PENSION_EMPLOYEE_RATE) / PERCENT;
}

export function computePensionEmployer(pensionableMonthly: number): number {
  return (pensionableMonthly * PENSION_EMPLOYER_RATE) / PERCENT;
}

export function computeNhf(basicMonthly: number): number {
  return (basicMonthly * NHF_RATE) / PERCENT;
}
