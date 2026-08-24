import { STATE_OF_EMPLOYMENT_VALUES } from "./employer";

/** NTA 2025 Fourth Schedule — band widths applied top-down on chargeable income. */
export const PIT_BAND_WIDTHS: ReadonlyArray<{
  width: number;
  rate: number;
  label: string;
}> = [
  { width: 800_000, rate: 0, label: "First ₦800,000 @ 0%" },
  { width: 2_200_000, rate: 0.15, label: "Next ₦2,200,000 @ 15%" },
  { width: 9_000_000, rate: 0.18, label: "Next ₦9,000,000 @ 18%" },
  { width: 13_000_000, rate: 0.21, label: "Next ₦13,000,000 @ 21%" },
  { width: 25_000_000, rate: 0.23, label: "Next ₦25,000,000 @ 23%" },
  {
    width: Number.POSITIVE_INFINITY,
    rate: 0.25,
    label: "Above ₦50,000,000 @ 25%",
  },
];

export const PIT_RENT_RELIEF_CAP_NGN = 500_000;
export const PIT_RENT_RELIEF_RATE = 0.2;
export const PIT_MINIMUM_WAGE_MONTHLY_NGN = 70_000;
export const PIT_DEFAULT_WHT_RATE_PERCENT = 5;
export const PIT_FILING_DUE_MONTH = 3;
export const PIT_FILING_DUE_DAY = 31;
export const PIT_PERIOD_MONTH = 12;

export const PIT_FINAL_WHT_CATEGORIES = new Set([
  "dividend_income",
  "interest_income",
]);

export const PIT_STATE_OF_RESIDENCE_VALUES = STATE_OF_EMPLOYMENT_VALUES;

export type PitComputationSnapshot = {
  tradingProfit: number;
  otherBusinessIncome: number;
  otherPersonalIncome: number;
  payerFees: number;
  payerFeesIncludedInSales: boolean;
  grossIncome: number;
  pensionContribution: number;
  nhfContribution: number;
  nhisContribution: number;
  annualRent: number;
  rentRelief: number;
  rentPeriodStart: string | null;
  rentPeriodEnd: string | null;
  landlordName: string | null;
  landlordContact: string | null;
  propertyAddress: string | null;
  lifeAssurance: number;
  mortgageInterest: number;
  totalReliefs: number;
  chargeableIncome: number;
  pitLiability: number;
  payeCredits: number;
  whtCredits: number;
  remainingPayable: number;
  minimumWageExempt: boolean;
};

export type PitBandResult = {
  label: string;
  width: number;
  rate: number;
  taxableAmount: number;
  tax: number;
};

export function pitDueDateForYear(periodYear: number): string {
  const y = periodYear + 1;
  return `${y}-${String(PIT_FILING_DUE_MONTH).padStart(2, "0")}-${String(PIT_FILING_DUE_DAY).padStart(2, "0")}`;
}

export function isPitYearOpenForFiling(
  periodYear: number,
  today = new Date(),
): boolean {
  return periodYear < today.getFullYear();
}

export function computeRentRelief(annualRent: number): number {
  if (annualRent <= 0) return 0;
  return Math.min(
    PIT_RENT_RELIEF_CAP_NGN,
    Math.round(annualRent * PIT_RENT_RELIEF_RATE),
  );
}

export function computeFourthScheduleTax(chargeableIncome: number): {
  pitLiability: number;
  bands: PitBandResult[];
} {
  let remaining = Math.max(0, chargeableIncome);
  let pitLiability = 0;
  const bands: PitBandResult[] = [];

  for (const band of PIT_BAND_WIDTHS) {
    if (remaining <= 0) break;
    const width =
      band.width === Number.POSITIVE_INFINITY ? remaining : band.width;
    const taxableAmount = Math.min(width, remaining);
    const tax = Math.round(taxableAmount * band.rate);
    bands.push({
      label: band.label,
      width:
        band.width === Number.POSITIVE_INFINITY ? taxableAmount : band.width,
      rate: band.rate,
      taxableAmount,
      tax,
    });
    pitLiability += tax;
    remaining -= taxableAmount;
  }

  return { pitLiability, bands };
}

export function normalizePayerCategory(category: string): string {
  return category.trim().toLowerCase();
}

export function isFinalWhtPayerCategory(category: string): boolean {
  return PIT_FINAL_WHT_CATEGORIES.has(normalizePayerCategory(category));
}

export type PitIncomeInputs = {
  tradingProfit: number;
  otherBusinessIncome: number;
  otherPersonalIncome: number;
  payerFees: number;
  payerFeesIncludedInSales: boolean;
  minimumWageExempt: boolean;
};

export type PitReliefInputs = {
  pensionContribution: number;
  nhfContribution: number;
  nhisContribution: number;
  annualRent: number;
  lifeAssurance: number;
  mortgageInterest: number;
};

export function computeGrossIncome(input: PitIncomeInputs): number {
  const payerFees = input.payerFeesIncludedInSales
    ? 0
    : Math.max(0, input.payerFees);
  return (
    input.tradingProfit +
    Math.max(0, input.otherBusinessIncome) +
    Math.max(0, input.otherPersonalIncome) +
    payerFees
  );
}

export function computeTotalReliefs(input: PitReliefInputs): {
  rentRelief: number;
  totalReliefs: number;
} {
  const rentRelief = computeRentRelief(input.annualRent);
  const totalReliefs =
    Math.max(0, input.pensionContribution) +
    Math.max(0, input.nhfContribution) +
    Math.max(0, input.nhisContribution) +
    rentRelief +
    Math.max(0, input.lifeAssurance) +
    Math.max(0, input.mortgageInterest);
  return { rentRelief, totalReliefs };
}

export function computePitFromSnapshot(
  snapshot: Omit<
    PitComputationSnapshot,
    | "grossIncome"
    | "rentRelief"
    | "totalReliefs"
    | "chargeableIncome"
    | "pitLiability"
    | "remainingPayable"
  >,
): PitComputationSnapshot & { bands: PitBandResult[] } {
  const grossIncome = computeGrossIncome({
    tradingProfit: snapshot.tradingProfit,
    otherBusinessIncome: snapshot.otherBusinessIncome,
    otherPersonalIncome: snapshot.otherPersonalIncome,
    payerFees: snapshot.payerFees,
    payerFeesIncludedInSales: snapshot.payerFeesIncludedInSales,
    minimumWageExempt: snapshot.minimumWageExempt,
  });
  const { rentRelief, totalReliefs } = computeTotalReliefs({
    pensionContribution: snapshot.pensionContribution,
    nhfContribution: snapshot.nhfContribution,
    nhisContribution: snapshot.nhisContribution,
    annualRent: snapshot.annualRent,
    lifeAssurance: snapshot.lifeAssurance,
    mortgageInterest: snapshot.mortgageInterest,
  });

  const chargeableIncome = snapshot.minimumWageExempt
    ? 0
    : Math.max(0, grossIncome - totalReliefs);
  const { pitLiability, bands } = snapshot.minimumWageExempt
    ? { pitLiability: 0, bands: [] as PitBandResult[] }
    : computeFourthScheduleTax(chargeableIncome);
  const remainingPayable = Math.max(
    0,
    pitLiability - snapshot.payeCredits - snapshot.whtCredits,
  );

  return {
    ...snapshot,
    grossIncome,
    rentRelief,
    totalReliefs,
    chargeableIncome,
    pitLiability,
    remainingPayable,
    bands,
  };
}

export function assertRentClaimComplete(snapshot: {
  annualRent: number;
  landlordName?: string | null;
  landlordContact?: string | null;
  propertyAddress?: string | null;
  rentPeriodStart?: string | null;
}): void {
  if (snapshot.annualRent <= 0) return;
  const required = [
    snapshot.landlordName,
    snapshot.landlordContact,
    snapshot.propertyAddress,
    snapshot.rentPeriodStart,
  ];
  if (required.some((v) => v == null || String(v).trim() === "")) {
    throw new Error("RENT_CLAIM_INCOMPLETE");
  }
}

export function amountsMatch(a: number, b: number, tolerance = 1): boolean {
  return Math.abs(a - b) <= tolerance;
}
