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

/** Monthly salary components for Annual Gross Income (Universal Nigeria PAYE 2026). */
export type PayeMonthlyEarningsInput = {
  basicMonthly: number;
  housingAllowanceMonthly?: number;
  transportAllowanceMonthly?: number;
  mealAllowanceMonthly?: number;
  otherTaxableAllowancesMonthly?: number;
  otherTaxableIncomeMonthly?: number;
};

/** Statutory reliefs / allowable deductions (annual house rent; other inputs monthly). */
export type PayeReliefInputs = {
  annualHouseRent?: number;
  nhisHealthInsuranceMonthly?: number;
  lifeAssurancePremiumMonthly?: number;
  mortgageInterestMonthly?: number;
  /** @deprecated Legacy annual deduction — not used on Employees API. */
  otherAllowableDeductions?: number;
};

export type PayeComputationBreakdown = {
  annualGrossIncome: number;
  annualPensionableIncome: number;
  pensionDeduction: number;
  nhfDeduction: number;
  annualNhis: number;
  houseRentRelief: number;
  lifeAssurancePremium: number;
  mortgageInterest: number;
  otherAllowableDeductions: number;
  totalStatutoryReliefs: number;
  totalDeductions: number;
  taxableIncome: number;
  annualPaye: number;
  monthlyPaye: number;
  /** @deprecated Use annualGrossIncome */
  grossAnnual: number;
  /** @deprecated Use taxableIncome */
  chargeableIncome: number;
  /** @deprecated Use annualNhis */
  nhisHealthInsurance: number;
  /** @deprecated Use otherAllowableDeductions */
  qualifyingMedicalExpenses: number;
};

function nonNegative(n: number | undefined | null): number {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

/**
 * Monthly taxable earnings = Basic + Housing + Transport + Meal + other taxable
 * allowances + other taxable income (PDF §1).
 */
export function computeMonthlyTaxableEarnings(
  input: PayeMonthlyEarningsInput,
): number {
  return (
    nonNegative(input.basicMonthly) +
    nonNegative(input.housingAllowanceMonthly) +
    nonNegative(input.transportAllowanceMonthly) +
    nonNegative(input.mealAllowanceMonthly) +
    nonNegative(input.otherTaxableAllowancesMonthly) +
    nonNegative(input.otherTaxableIncomeMonthly)
  );
}

/** Annual Gross Income = 12 × monthly taxable earnings (PDF §1). */
export function computeAnnualGrossIncome(input: PayeMonthlyEarningsInput): number {
  return computeMonthlyTaxableEarnings(input) * 12;
}

/**
 * Rent Relief = MIN(20% × Annual House Rent, ₦500,000).
 * `annualHouseRent` is actual rent paid — not the relief amount.
 */
export function computeHouseRentRelief(annualHouseRent: number): number {
  const rent = nonNegative(annualHouseRent);
  return Math.min(rent * HOUSE_RENT_RELIEF_RATE, HOUSE_RENT_RELIEF_CAP);
}

/** Sum optional reliefs (excludes pension and NHF). Monthly inputs annualized ×12. */
export function computeAnnualPayeReliefs(reliefs?: PayeReliefInputs): {
  houseRentRelief: number;
  annualNhis: number;
  annualLifeAssurancePremium: number;
  annualMortgageInterest: number;
  otherAllowableDeductions: number;
  totalAdditionalReliefs: number;
} {
  const houseRentRelief = computeHouseRentRelief(reliefs?.annualHouseRent ?? 0);
  const annualNhis =
    nonNegative(reliefs?.nhisHealthInsuranceMonthly) * 12;
  const annualLifeAssurancePremium =
    nonNegative(reliefs?.lifeAssurancePremiumMonthly) * 12;
  const annualMortgageInterest =
    nonNegative(reliefs?.mortgageInterestMonthly) * 12;
  const otherAllowableDeductions = nonNegative(
    reliefs?.otherAllowableDeductions,
  );
  return {
    houseRentRelief,
    annualNhis,
    annualLifeAssurancePremium,
    annualMortgageInterest,
    otherAllowableDeductions,
    totalAdditionalReliefs:
      houseRentRelief +
      annualNhis +
      annualLifeAssurancePremium +
      annualMortgageInterest +
      otherAllowableDeductions,
  };
}

/** Monthly pensionable emoluments — basic + housing + transport (PDF §2). */
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

/**
 * Universal Nigeria PAYE 2026 — strict PDF formula (sections 1–7).
 */
export function computePayeFromMonthlyEarnings(input: {
  earnings: PayeMonthlyEarningsInput;
  employeePensionRate?: number;
  nhfApplicable?: boolean;
  employeeContributesNhf?: boolean;
  reliefs?: PayeReliefInputs;
}): PayeComputationBreakdown {
  const employeePensionRate = input.employeePensionRate ?? PENSION_EMPLOYEE_RATE;
  const annualGrossIncome = computeAnnualGrossIncome(input.earnings);

  const pensionableMonthly = computePensionableMonthly({
    basicMonthly: input.earnings.basicMonthly,
    housingAllowanceMonthly: input.earnings.housingAllowanceMonthly,
    transportAllowanceMonthly: input.earnings.transportAllowanceMonthly,
  });
  const annualPensionableIncome = pensionableMonthly * 12;
  const pensionDeduction =
    (annualPensionableIncome * employeePensionRate) / PERCENT;

  const basicMonthly = nonNegative(input.earnings.basicMonthly);
  const nhfOn =
    input.nhfApplicable !== false && input.employeeContributesNhf !== false;
  const nhfDeduction =
    nhfOn && basicMonthly > 0
      ? (basicMonthly * 12 * NHF_RATE) / PERCENT
      : 0;

  const statutoryReliefs = computeAnnualPayeReliefs(input.reliefs);
  const totalDeductions =
    pensionDeduction +
    nhfDeduction +
    statutoryReliefs.totalAdditionalReliefs;

  const taxableIncome = Math.max(0, annualGrossIncome - totalDeductions);
  const annualPaye = computeProgressivePitFromChargeableIncome(taxableIncome);

  return {
    annualGrossIncome,
    annualPensionableIncome,
    pensionDeduction,
    nhfDeduction,
    annualNhis: statutoryReliefs.annualNhis,
    houseRentRelief: statutoryReliefs.houseRentRelief,
    lifeAssurancePremium: statutoryReliefs.annualLifeAssurancePremium,
    mortgageInterest: statutoryReliefs.annualMortgageInterest,
    otherAllowableDeductions: statutoryReliefs.otherAllowableDeductions,
    totalStatutoryReliefs: statutoryReliefs.totalAdditionalReliefs,
    totalDeductions,
    taxableIncome,
    annualPaye,
    monthlyPaye: annualPaye / 12,
    grossAnnual: annualGrossIncome,
    chargeableIncome: taxableIncome,
    nhisHealthInsurance: statutoryReliefs.annualNhis,
    qualifyingMedicalExpenses: statutoryReliefs.otherAllowableDeductions,
  };
}

/** Monthly PAYE for one employee record (PDF strict). */
export function computeEmployeePayeMonthly(
  employee: {
    basicSalary: number;
    housingAllowance?: number;
    transportAllowance?: number;
    mealAllowance?: number;
    otherAllowances?: number;
    annualHouseRent?: number;
    nhisHealthInsuranceMonthly?: number;
    lifeAssurancePremiumMonthly?: number;
    mortgageInterestMonthly?: number;
    nhf?: boolean;
  },
  opts?: { nhfApplicable?: boolean },
): number {
  return computePayeFromMonthlyEarnings({
    earnings: {
      basicMonthly: employee.basicSalary,
      housingAllowanceMonthly: employee.housingAllowance,
      transportAllowanceMonthly: employee.transportAllowance,
      mealAllowanceMonthly: employee.mealAllowance,
      otherTaxableAllowancesMonthly: employee.otherAllowances,
    },
    nhfApplicable: opts?.nhfApplicable,
    employeeContributesNhf: employee.nhf !== false,
    reliefs: {
      annualHouseRent: employee.annualHouseRent,
      nhisHealthInsuranceMonthly: employee.nhisHealthInsuranceMonthly,
      lifeAssurancePremiumMonthly: employee.lifeAssurancePremiumMonthly,
      mortgageInterestMonthly: employee.mortgageInterestMonthly,
    },
  }).monthlyPaye;
}

/**
 * Legacy profile gross (single monthly figure) — backward compatibility only.
 * Treats the amount as basic salary for AGI, pensionable base, and NHF.
 */
export function computeLegacyPayeMonthlyFromProfileGross(
  grossMonthly: number,
): number {
  if (grossMonthly <= 0) return 0;
  return computePayeFromMonthlyEarnings({
    earnings: { basicMonthly: grossMonthly },
    employeeContributesNhf: true,
  }).monthlyPaye;
}

/** @deprecated Use computePayeFromMonthlyEarnings or computeEmployeePayeMonthly. */
export function computeAnnualPaye(
  grossAnnual: number,
  opts?: PayeReliefInputs & {
    pensionContributionAnnual?: number;
    pensionableAnnual?: number;
    basicAnnual?: number;
    nhfApplicable?: boolean;
    nhfContributionAnnual?: number;
  },
): PayeComputationBreakdown {
  const gross = nonNegative(grossAnnual);
  const basicAnnual = opts?.basicAnnual ?? gross;
  const pensionDeduction =
    opts?.pensionContributionAnnual != null
      ? nonNegative(opts.pensionContributionAnnual)
      : opts?.pensionableAnnual != null
        ? (nonNegative(opts.pensionableAnnual) * PENSION_EMPLOYEE_RATE) / PERCENT
        : 0;

  const nhfApplicable = opts?.nhfApplicable !== false;
  const nhfDeduction =
    opts?.nhfContributionAnnual != null
      ? nonNegative(opts.nhfContributionAnnual)
      : nhfApplicable && basicAnnual > 0
        ? (nonNegative(basicAnnual) * NHF_RATE) / PERCENT
        : 0;

  const statutoryReliefs = computeAnnualPayeReliefs(opts);
  const totalDeductions =
    pensionDeduction + nhfDeduction + statutoryReliefs.totalAdditionalReliefs;
  const taxableIncome = Math.max(0, gross - totalDeductions);
  const annualPaye = computeProgressivePitFromChargeableIncome(taxableIncome);

  const annualPensionableIncome =
    opts?.pensionableAnnual ??
    (pensionDeduction > 0
      ? (pensionDeduction * 100) / PENSION_EMPLOYEE_RATE
      : 0);

  return {
    annualGrossIncome: gross,
    annualPensionableIncome,
    pensionDeduction,
    nhfDeduction,
    annualNhis: statutoryReliefs.annualNhis,
    houseRentRelief: statutoryReliefs.houseRentRelief,
    lifeAssurancePremium: statutoryReliefs.annualLifeAssurancePremium,
    mortgageInterest: statutoryReliefs.annualMortgageInterest,
    otherAllowableDeductions: statutoryReliefs.otherAllowableDeductions,
    totalStatutoryReliefs: statutoryReliefs.totalAdditionalReliefs,
    totalDeductions,
    taxableIncome,
    annualPaye,
    monthlyPaye: annualPaye / 12,
    grossAnnual: gross,
    chargeableIncome: taxableIncome,
    nhisHealthInsurance: statutoryReliefs.annualNhis,
    qualifyingMedicalExpenses: statutoryReliefs.otherAllowableDeductions,
  };
}

/** @deprecated Use computeEmployeePayeMonthly or computePayeFromMonthlyEarnings. */
export function computePayeMonthly(
  grossAnnual: number,
  opts?: Parameters<typeof computeAnnualPaye>[1],
): number {
  return computeAnnualPaye(grossAnnual, opts).monthlyPaye;
}

/** @deprecated Use computePayeFromMonthlyEarnings with earnings + reliefs. */
export function buildEmployeePayeOptions(input: {
  grossMonthly: number;
  basicMonthly: number;
  housingAllowanceMonthly?: number;
  transportAllowanceMonthly?: number;
  mealAllowanceMonthly?: number;
  otherTaxableAllowancesMonthly?: number;
  otherTaxableIncomeMonthly?: number;
  nhfApplicable?: boolean;
  employeeContributesNhf?: boolean;
  reliefs?: PayeReliefInputs;
}) {
  return {
    earnings: {
      basicMonthly: input.basicMonthly,
      housingAllowanceMonthly: input.housingAllowanceMonthly,
      transportAllowanceMonthly: input.transportAllowanceMonthly,
      mealAllowanceMonthly: input.mealAllowanceMonthly,
      otherTaxableAllowancesMonthly: input.otherTaxableAllowancesMonthly,
      otherTaxableIncomeMonthly: input.otherTaxableIncomeMonthly,
    },
    nhfApplicable: input.nhfApplicable,
    employeeContributesNhf: input.employeeContributesNhf,
    reliefs: input.reliefs,
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
