import { PERCENT, WHT_RATE_SERVICES_PERCENT } from "./percentages";
import {
  PIT_PROGRESSIVE_BRACKETS,
} from "./pitTaxSchedule";

export const EMPLOYER_TYPES = [
  "LIMITED_COMPANY",
  "SOLE_PROPRIETORSHIP",
  "UNREGISTERED",
] as const;
export type EmployerType = (typeof EMPLOYER_TYPES)[number];

export const EMPLOYER_RELATIONSHIPS = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACTOR",
] as const;
export type EmployerRelationship = (typeof EMPLOYER_RELATIONSHIPS)[number];

export const EMPLOYER_PAYMENT_METHODS = [
  "BASIC_MONTHLY",
  "CUSTOM",
  "ONE_OFF",
] as const;
export type EmployerPaymentMethod = (typeof EMPLOYER_PAYMENT_METHODS)[number];

export const EMPLOYER_PAYMENT_FREQUENCIES = [
  "WEEKLY",
  "FORTNIGHTLY",
  "MONTHLY",
  "QUARTERLY",
  "ANNUALLY",
  "ONE_OFF",
] as const;
export type EmployerPaymentFrequency =
  (typeof EMPLOYER_PAYMENT_FREQUENCIES)[number];

export const EMPLOYER_TAX_TREATMENTS = [
  "PAYE",
  "WHT",
  "SELF_ASSESSMENT",
] as const;
export type EmployerTaxTreatment = (typeof EMPLOYER_TAX_TREATMENTS)[number];

export const INCOME_KINDS = ["EMPLOYMENT", "PROFESSIONAL"] as const;
export type IncomeKind = (typeof INCOME_KINDS)[number];

export const EMPLOYMENT_STATUSES = ["ACTIVE", "ENDED"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const PENSION_STATUSES = ["ACTIVE", "EXEMPT", "PENDING"] as const;
export type PensionStatus = (typeof PENSION_STATUSES)[number];

export const EMPLOYER_DOCUMENT_KINDS = [
  "CONTRACT",
  "PAYSLIP",
  "PAYE_EVIDENCE",
  "PENSION_STATEMENT",
  "OTHER",
] as const;
export type EmployerDocumentKind = (typeof EMPLOYER_DOCUMENT_KINDS)[number];

export const DOCUMENT_STATUSES = ["MISSING", "LINKED"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const NATIONAL_MINIMUM_WAGE_MONTHLY_NGN = 70_000;
export const MAX_MONEY_NGN = 999_999_999_999.99;
export const DEFAULT_EMPLOYEE_PENSION_RATE = 8;
export const DEFAULT_EMPLOYER_PENSION_RATE = 10;

export const EMPLOYER_PFA_NAMES = [
  "Access ARM Pensions Limited",
  "Cardinal Stone Pensions Limited",
  "Citizens Pensions Limited",
  "Crusader Sterling Pensions Limited",
  "FCMB Pensions Limited",
  "Fidelity Pension Managers Limited",
  "Guaranty Trust Pension Managers Limited",
  "Leadway PFA Limited",
  "Nigerian University Pension Management Company (NUPEMCO)",
  "NLPC Pension Fund Administrators Limited",
  "Norrenberger Pensions Limited",
  "NPF Pension Managers Limited",
  "OAK Pensions Limited",
  "Parthian Pensions Limited",
  "Premium Pension Limited",
  "Stanbic IBTC Pension Managers Limited",
  "Tangerine APT Pensions Limited",
  "Trustfund Pensions Limited",
  "Veritas Glanvills Pensions Limited",
  "Zenith Pensions Limited",
] as const;

export const STATE_OF_EMPLOYMENT_VALUES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
  "Abuja (FCT)",
] as const;

const FREQUENCY_MULTIPLIERS: Record<EmployerPaymentFrequency, number> = {
  WEEKLY: 52,
  FORTNIGHTLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  ANNUALLY: 1,
  ONE_OFF: 1,
};

export type EmployerRemunerationInput = {
  paymentMethod: EmployerPaymentMethod;
  paymentFrequency: EmployerPaymentFrequency;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  bonuses: number;
  commissions: number;
  hasPension: boolean;
  employeeRate?: number | null;
};

export type EmployerProfileInput = EmployerRemunerationInput & {
  employerType: EmployerType;
  relationship: EmployerRelationship;
  endDate?: string | null;
};

export function resolveEmployerTaxTreatment(
  employerType: EmployerType,
  relationship: EmployerRelationship,
): EmployerTaxTreatment {
  if (employerType === "LIMITED_COMPANY") {
    if (relationship === "CONTRACTOR") return "WHT";
    return "PAYE";
  }
  if (employerType === "SOLE_PROPRIETORSHIP") {
    if (relationship === "CONTRACTOR") return "SELF_ASSESSMENT";
    return "PAYE";
  }
  return "SELF_ASSESSMENT";
}

export function resolveIncomeKind(
  relationship: EmployerRelationship,
): IncomeKind {
  return relationship === "CONTRACTOR" ? "PROFESSIONAL" : "EMPLOYMENT";
}

export function computePeriodGross(input: EmployerRemunerationInput): number {
  return (
    input.basicSalary +
    input.housingAllowance +
    input.transportAllowance +
    input.otherAllowances +
    input.bonuses +
    input.commissions
  );
}

export function computeAnnualIncome(input: EmployerRemunerationInput): number {
  const periodGross = computePeriodGross(input);
  if (
    input.paymentMethod === "ONE_OFF" ||
    input.paymentFrequency === "ONE_OFF"
  ) {
    return periodGross;
  }
  return periodGross * FREQUENCY_MULTIPLIERS[input.paymentFrequency];
}

export function computeMonthlyIncome(input: EmployerRemunerationInput): number {
  const periodGross = computePeriodGross(input);
  if (
    input.paymentFrequency === "MONTHLY" ||
    input.paymentMethod === "BASIC_MONTHLY"
  ) {
    return periodGross;
  }
  return Math.round(computeAnnualIncome(input) / 12);
}

export function computePensionableIncomePeriod(
  input: EmployerRemunerationInput,
): number {
  return (
    input.basicSalary + input.housingAllowance + input.transportAllowance
  );
}

export function computeAnnualPensionable(
  input: EmployerRemunerationInput,
): number {
  const period = computePensionableIncomePeriod(input);
  if (
    input.paymentMethod === "ONE_OFF" ||
    input.paymentFrequency === "ONE_OFF"
  ) {
    return period;
  }
  return period * FREQUENCY_MULTIPLIERS[input.paymentFrequency];
}

export function computeEmployeePensionAnnual(
  input: EmployerRemunerationInput,
): number {
  if (!input.hasPension) return 0;
  const rate = input.employeeRate ?? DEFAULT_EMPLOYEE_PENSION_RATE;
  return (computeAnnualPensionable(input) * rate) / PERCENT;
}

export function computeEmployerPensionAnnual(
  input: EmployerRemunerationInput,
  employerRate?: number | null,
): number {
  if (!input.hasPension) return 0;
  const rate = employerRate ?? DEFAULT_EMPLOYER_PENSION_RATE;
  return (computeAnnualPensionable(input) * rate) / PERCENT;
}

export function resolveEmploymentStatus(
  endDate: string | null | undefined,
  todayYmd = formatTodayYmd(),
): EmploymentStatus {
  if (!endDate) return "ACTIVE";
  return endDate < todayYmd ? "ENDED" : "ACTIVE";
}

export function formatTodayYmd(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export type EmployerTaxComputation = {
  treatment: EmployerTaxTreatment;
  incomeKind: IncomeKind;
  annualGross: number;
  monthlyGross: number;
  months: number;
  annualPensionable: number;
  employeeRate: number;
  employerRate: number;
  employeePension: number;
  employerPension: number;
  minimumWageExempt: boolean;
  chargeableIncome: number;
  bands: Array<{ label: string; tax: number }>;
  pitPayable: number;
  sourceTax: number;
  sourceTaxIsEstimated: boolean;
  whtRate: number;
  netLiability: number;
  effectiveRate: number;
};

function formatBandLabel(ratePercent: number, width: number): string {
  const rateLabel = ratePercent === 0 ? "0%" : `${ratePercent}%`;
  if (width === Number.POSITIVE_INFINITY) {
    return `Above ₦50,000,000 @ ${rateLabel}`;
  }
  const formatted = width.toLocaleString("en-NG");
  if (ratePercent === 0) return `First ₦${formatted} @ ${rateLabel}`;
  return `Next ₦${formatted} @ ${rateLabel}`;
}

export function computeEmployerTaxComputation(
  profile: EmployerProfileInput,
  payeCredit: number,
): EmployerTaxComputation {
  const treatment = resolveEmployerTaxTreatment(
    profile.employerType,
    profile.relationship,
  );
  const incomeKind = resolveIncomeKind(profile.relationship);
  const annualGross = computeAnnualIncome(profile);
  const monthlyGross = computeMonthlyIncome(profile);
  const months =
    monthlyGross > 0
      ? Math.max(1, Math.round(annualGross / monthlyGross))
      : 12;
  const annualPensionable = computeAnnualPensionable(profile);
  const employeeRate = profile.hasPension
    ? (profile.employeeRate ?? DEFAULT_EMPLOYEE_PENSION_RATE)
    : 0;
  const employerRate = profile.hasPension
    ? DEFAULT_EMPLOYER_PENSION_RATE
    : 0;
  const employeePension = computeEmployeePensionAnnual(profile);
  const employerPension = computeEmployerPensionAnnual(profile, employerRate);
  const minimumWageExempt =
    incomeKind === "EMPLOYMENT" &&
    annualGross / 12 <= NATIONAL_MINIMUM_WAGE_MONTHLY_NGN;
  const chargeableIncome = minimumWageExempt
    ? 0
    : Math.max(0, annualGross - employeePension);

  const bands: Array<{ label: string; tax: number }> = [];
  let prevLimit = 0;
  let remaining = chargeableIncome;
  let pitPayable = 0;

  for (const bracket of PIT_PROGRESSIVE_BRACKETS) {
    const width =
      bracket.limit === Number.POSITIVE_INFINITY
        ? Number.POSITIVE_INFINITY
        : bracket.limit - prevLimit;
    const slice =
      width === Number.POSITIVE_INFINITY
        ? remaining
        : Math.min(remaining, width);
    const tax = (slice * bracket.ratePercent) / PERCENT;
    bands.push({
      label: formatBandLabel(bracket.ratePercent, width),
      tax: Math.round(tax * 100) / 100,
    });
    pitPayable += tax;
    remaining -= slice;
    prevLimit = bracket.limit;
    if (remaining <= 0) break;
  }
  pitPayable = Math.round(pitPayable * 100) / 100;

  let sourceTax = 0;
  let sourceTaxIsEstimated = false;
  let whtRate = 0;

  if (treatment === "PAYE") {
    if (payeCredit > 0) {
      sourceTax = payeCredit;
    } else {
      sourceTax = pitPayable;
      sourceTaxIsEstimated = true;
    }
  } else if (treatment === "WHT") {
    whtRate = WHT_RATE_SERVICES_PERCENT;
    sourceTax = Math.round((annualGross * whtRate) / PERCENT);
  }

  const netLiability = Math.max(0, pitPayable - sourceTax);
  const effectiveRate =
    annualGross > 0
      ? Math.round((pitPayable / annualGross) * PERCENT * 1000) / 1000
      : 0;

  return {
    treatment,
    incomeKind,
    annualGross,
    monthlyGross,
    months,
    annualPensionable,
    employeeRate,
    employerRate,
    employeePension,
    employerPension,
    minimumWageExempt,
    chargeableIncome,
    bands,
    pitPayable,
    sourceTax,
    sourceTaxIsEstimated,
    whtRate,
    netLiability,
    effectiveRate,
  };
}

export function taxEvidenceTitle(
  treatment: EmployerTaxTreatment,
  year: number,
): string {
  if (treatment === "PAYE") return `PAYE Evidence (${year})`;
  if (treatment === "WHT") return `WHT Evidence (${year})`;
  return `Payment Evidence (${year})`;
}

export function taxEvidenceCategoryLabel(
  treatment: EmployerTaxTreatment,
): string {
  if (treatment === "PAYE") return "PAYE Evidence";
  if (treatment === "WHT") return "WHT Evidence";
  return "Payment Evidence";
}

export function employerDocumentCategoryLabel(
  kind: EmployerDocumentKind,
  input: {
    taxTreatment: EmployerTaxTreatment;
    relationship: EmployerRelationship;
  },
): string {
  switch (kind) {
    case "CONTRACT":
      return "Contract / Agreement";
    case "PAYSLIP":
      return input.relationship === "CONTRACTOR"
        ? "Invoice / Fee note"
        : "Payslip";
    case "PAYE_EVIDENCE":
      return taxEvidenceCategoryLabel(input.taxTreatment);
    case "PENSION_STATEMENT":
      return "Pension Statement";
    default:
      return "Supporting Document";
  }
}

export function normalizeEmployerDocumentKind(
  kind: string,
): EmployerDocumentKind {
  const upper = kind.toUpperCase().replace(/-/g, "_");
  if ((EMPLOYER_DOCUMENT_KINDS as readonly string[]).includes(upper)) {
    return upper as EmployerDocumentKind;
  }
  const lowerMap: Record<string, EmployerDocumentKind> = {
    contract: "CONTRACT",
    payslip: "PAYSLIP",
    paye_evidence: "PAYE_EVIDENCE",
    pension_statement: "PENSION_STATEMENT",
    other: "OTHER",
  };
  return lowerMap[kind.toLowerCase()] ?? "OTHER";
}
