import {
  computeProgressivePitFromChargeableIncome,
  PIT_TAX_FREE_THRESHOLD_NGN,
} from "./pitTaxSchedule";

export type PitEstimateResult = {
  estimatedAnnualPitNgn: number;
  chargeableIncomeProxyAnnualNgn: number;
  methodology: string;
};

/** Progressive PIT on annual chargeable income (NGN). Excludes CRA, exemptions, minimum tax — see methodology. */
export function estimateAnnualPersonalIncomeTaxNg(
  chargeableIncomeAnnualNgn: number,
): PitEstimateResult {
  const income = Math.max(0, chargeableIncomeAnnualNgn);
  const tax = computeProgressivePitFromChargeableIncome(income);

  const methodology =
    `Estimated using Nigeria NRS progressive PIT bands on annual chargeable income ` +
    `(first ₦${PIT_TAX_FREE_THRESHOLD_NGN.toLocaleString("en-NG")} at 0%, then 15% / 18% / 21% / 23% / 25%) ` +
    `proxied by 12 × monthly net profit from records. Consolidated Relief Allowances, rent relief, exclusions, ` +
    `partnerships, PAYE withheld, director rules, minimum tax — not applied. Sole traders should verify filings with relevant state IRS.`;

  return {
    estimatedAnnualPitNgn: tax,
    chargeableIncomeProxyAnnualNgn: income,
    methodology,
  };
}
