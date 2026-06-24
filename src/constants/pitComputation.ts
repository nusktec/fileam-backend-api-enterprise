import { PERCENT } from "./percentages";

/** Nigeria PITA Sixth Schedule stepped rates on chargeable income (simplified estimator). */
const PIT_CHARGEABLE_BANDS: ReadonlyArray<{
  width: number;
  ratePercent: number;
}> = [
  { width: 300_000, ratePercent: 7 },
  { width: 300_000, ratePercent: 11 },
  { width: 500_000, ratePercent: 15 },
  { width: 500_000, ratePercent: 19 },
  { width: 1_600_000, ratePercent: 21 },
  { width: Number.POSITIVE_INFINITY, ratePercent: 24 },
];

export type PitEstimateResult = {
  estimatedAnnualPitNgn: number;
  chargeableIncomeProxyAnnualNgn: number;
  methodology: string;
};

/** Progressive PIT on annual chargeable income (NGN). Excludes CRA, exemptions, minimum tax — see methodology string. */
export function estimateAnnualPersonalIncomeTaxNg(
  chargeableIncomeAnnualNgn: number,
): PitEstimateResult {
  const income = Math.max(0, chargeableIncomeAnnualNgn);
  let remaining = income;
  let tax = 0;

  for (const band of PIT_CHARGEABLE_BANDS) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, band.width);
    tax += (slice * band.ratePercent) / PERCENT;
    remaining -= slice;
  }

  const methodology =
    "Estimated using Nigeria PITA Sixth Schedule progressive bands on annual chargeable income proxied by 12 × monthly net profit from records. Consolidated Relief Allowances, rent relief, exclusions, exemption thresholds, partnerships, PAYE withheld, director rules, minimum tax — not applied. Sole traders should verify filings with relevant state IRS.";

  //return line and so
  return {
    estimatedAnnualPitNgn: Math.round(tax * 100) / 100,
    chargeableIncomeProxyAnnualNgn: income,
    methodology,
  };
}
