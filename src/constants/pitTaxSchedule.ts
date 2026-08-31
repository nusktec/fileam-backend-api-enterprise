import { PERCENT } from "./percentages";

/** First ₦800,000 of annual chargeable income is tax-exempt under the current NRS PIT schedule. */
export const PIT_TAX_FREE_THRESHOLD_NGN = 800_000;

/**
 * Nigeria PIT / PAYE progressive bands on annual chargeable income (after reliefs for PAYE).
 * Cumulative upper limits — matches:
 *   C ≤ 800k → 0; then 15%, 18%, 21%, 23%, 25% on successive bands.
 */
export const PIT_PROGRESSIVE_BRACKETS: ReadonlyArray<{
  limit: number;
  ratePercent: number;
}> = [
  { limit: 800_000, ratePercent: 0 },
  { limit: 3_000_000, ratePercent: 15 },
  { limit: 12_000_000, ratePercent: 18 },
  { limit: 25_000_000, ratePercent: 21 },
  { limit: 50_000_000, ratePercent: 23 },
  { limit: Number.POSITIVE_INFINITY, ratePercent: 25 },
];

export type ProgressivePitBand = {
  width: number;
  ratePercent: number;
  taxableAmount: number;
  tax: number;
};

/** Shared NTA 2025 Fourth Schedule engine — used by PAYE and PIT filing. */
export function computeProgressivePitWithBands(
  chargeableIncomeAnnualNgn: number,
): { pitLiability: number; bands: ProgressivePitBand[] } {
  const taxable = Math.max(0, chargeableIncomeAnnualNgn);
  if (taxable <= 0) return { pitLiability: 0, bands: [] };

  let tax = 0;
  let prevLimit = 0;
  const bands: ProgressivePitBand[] = [];

  for (const bracket of PIT_PROGRESSIVE_BRACKETS) {
    if (taxable <= prevLimit) break;
    const width =
      bracket.limit === Number.POSITIVE_INFINITY
        ? taxable - prevLimit
        : bracket.limit - prevLimit;
    const slice = Math.min(taxable - prevLimit, width);
    const sliceTax = (slice * bracket.ratePercent) / PERCENT;
    tax += sliceTax;
    bands.push({
      width: bracket.limit === Number.POSITIVE_INFINITY ? slice : width,
      ratePercent: bracket.ratePercent,
      taxableAmount: slice,
      tax: sliceTax,
    });
    prevLimit = bracket.limit;
    if (taxable <= bracket.limit) break;
  }

  return {
    pitLiability: Math.round(tax * 100) / 100,
    bands,
  };
}

/** Progressive PIT on annual chargeable income (NGN). */
export function computeProgressivePitFromChargeableIncome(
  chargeableIncomeAnnualNgn: number,
): number {
  return computeProgressivePitWithBands(chargeableIncomeAnnualNgn).pitLiability;
}
