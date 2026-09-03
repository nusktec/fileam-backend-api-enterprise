import { PERCENT } from "./percentages";
import {
  normalizeDepreciationMethod,
  type DepreciationMethod,
} from "./assets";
import { normalizeMoneyAmount } from "../utils/monetaryAmount";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;

export type AssetDepreciationInput = {
  purchaseCost: number;
  purchaseDate: Date;
  depreciationMethod?: string | null;
  usefulLife?: number | null;
  residualValue?: number | null;
  depreciationRate?: number | null;
  totalEstimatedUnit?: number | null;
  unitProduced?: number | null;
  asOf?: Date;
};

export type AssetDepreciationResult = {
  annualDepreciation: number;
  monthlyDepreciation: number;
  accumulatedDepreciation: number;
  bookValue: number;
  remainingUsefulLife: number | null;
  /** SL: 100/life; RB: rate %; UOP: 0 */
  depreciationPercentage: number;
  depreciationPerUnit: number | null;
  method: DepreciationMethod | null;
};

function emptyResult(
  cost: number,
  method: DepreciationMethod | null,
): AssetDepreciationResult {
  return {
    annualDepreciation: 0,
    monthlyDepreciation: 0,
    accumulatedDepreciation: 0,
    bookValue: cost,
    remainingUsefulLife: null,
    depreciationPercentage: 0,
    depreciationPerUnit: null,
    method,
  };
}

function yearsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / (MS_PER_DAY * DAYS_PER_YEAR));
}

/** Calendar months from start month through asOf month (inclusive). */
function calendarMonthsInclusive(from: Date, to: Date): number {
  if (to.getTime() < from.getTime()) return 0;
  const fromYear = from.getUTCFullYear();
  const fromMonth = from.getUTCMonth();
  const toYear = to.getUTCFullYear();
  const toMonth = to.getUTCMonth();
  return (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
}

/** Depreciation starts the month after purchase (accumulated stays 0 in purchase month). */
function depreciationStartMonth(purchaseDate: Date): Date {
  return new Date(
    Date.UTC(purchaseDate.getUTCFullYear(), purchaseDate.getUTCMonth() + 1, 1),
  );
}

function computeStraightLine(
  cost: number,
  residual: number,
  usefulLife: number,
  purchaseDate: Date,
  asOf: Date,
): AssetDepreciationResult {
  if (usefulLife <= 0 || cost <= residual) {
    return emptyResult(cost, "STRAIGHT_LINE");
  }
  const depreciable = cost - residual;
  const annualDepreciation = normalizeMoneyAmount(depreciable / usefulLife);
  const monthlyDepreciation = normalizeMoneyAmount(annualDepreciation / 12);
  const totalMonths = usefulLife * 12;
  const monthsElapsed = Math.min(
    totalMonths,
    calendarMonthsInclusive(depreciationStartMonth(purchaseDate), asOf),
  );
  const accumulatedDepreciation = normalizeMoneyAmount(
    Math.min(depreciable, Math.max(0, monthlyDepreciation * monthsElapsed)),
  );
  const bookValue = normalizeMoneyAmount(
    Math.max(residual, cost - accumulatedDepreciation),
  );
  const yearsElapsed = monthsElapsed / 12;
  return {
    annualDepreciation,
    monthlyDepreciation,
    accumulatedDepreciation,
    bookValue,
    remainingUsefulLife: normalizeMoneyAmount(Math.max(0, usefulLife - yearsElapsed)),
    depreciationPercentage: normalizeMoneyAmount(PERCENT / usefulLife),
    depreciationPerUnit: null,
    method: "STRAIGHT_LINE",
  };
}

function computeReducingBalance(
  cost: number,
  residual: number,
  ratePercent: number,
  usefulLife: number | null,
  purchaseDate: Date,
  asOf: Date,
): AssetDepreciationResult {
  if (ratePercent <= 0 || cost <= residual) {
    return {
      ...emptyResult(cost, "REDUCING_BALANCE"),
      remainingUsefulLife: usefulLife,
      depreciationPercentage: ratePercent,
    };
  }

  const rate = ratePercent / PERCENT;
  const depStart = depreciationStartMonth(purchaseDate);
  if (asOf.getTime() < depStart.getTime()) {
    const annualFromCost = normalizeMoneyAmount(
      Math.min(cost - residual, cost * rate),
    );
    return {
      annualDepreciation: annualFromCost,
      monthlyDepreciation: normalizeMoneyAmount(annualFromCost / 12),
      accumulatedDepreciation: 0,
      bookValue: cost,
      remainingUsefulLife: usefulLife,
      depreciationPercentage: ratePercent,
      depreciationPerUnit: null,
      method: "REDUCING_BALANCE",
    };
  }

  const yearsElapsed = yearsBetween(depStart, asOf);
  const fullYears = Math.floor(yearsElapsed);
  const fraction = yearsElapsed - fullYears;

  const applyPeriod = (obv: number, fractionOfYear: number): number => {
    if (obv <= residual || fractionOfYear <= 0) return 0;
    const raw = obv * rate * fractionOfYear;
    const maxDep = obv - residual;
    return normalizeMoneyAmount(Math.min(raw, maxDep));
  };

  let opening = cost;
  let accumulated = 0;

  for (let y = 0; y < fullYears; y++) {
    const dep = applyPeriod(opening, 1);
    if (dep <= 0) break;
    accumulated = normalizeMoneyAmount(accumulated + dep);
    opening = normalizeMoneyAmount(opening - dep);
  }

  const openingThisYear = opening;
  const annualFromOpening = applyPeriod(openingThisYear, 1);

  if (fraction > 0) {
    const dep = applyPeriod(opening, fraction);
    if (dep > 0) {
      accumulated = normalizeMoneyAmount(accumulated + dep);
      opening = normalizeMoneyAmount(opening - dep);
    }
  }

  const bookValue = normalizeMoneyAmount(Math.max(residual, cost - accumulated));

  return {
    annualDepreciation: annualFromOpening,
    monthlyDepreciation: normalizeMoneyAmount(annualFromOpening / 12),
    accumulatedDepreciation: accumulated,
    bookValue,
    remainingUsefulLife:
      usefulLife != null && usefulLife > 0
        ? normalizeMoneyAmount(Math.max(0, usefulLife - yearsElapsed))
        : usefulLife,
    depreciationPercentage: ratePercent,
    depreciationPerUnit: null,
    method: "REDUCING_BALANCE",
  };
}

function computeUnitsOfProduction(
  cost: number,
  residual: number,
  totalEstimatedUnit: number,
  unitProduced: number,
): AssetDepreciationResult {
  if (totalEstimatedUnit <= 0 || cost <= residual) {
    return emptyResult(cost, "UNIT_OF_PRODUCTION");
  }
  const depreciable = cost - residual;
  const perUnit = depreciable / totalEstimatedUnit;
  const units = Math.max(0, Math.min(unitProduced, totalEstimatedUnit));
  const periodDepreciation = normalizeMoneyAmount(perUnit * units);
  const accumulatedDepreciation = normalizeMoneyAmount(
    Math.min(depreciable, periodDepreciation),
  );
  const bookValue = normalizeMoneyAmount(
    Math.max(residual, cost - accumulatedDepreciation),
  );
  return {
    annualDepreciation: accumulatedDepreciation,
    monthlyDepreciation: accumulatedDepreciation,
    accumulatedDepreciation,
    bookValue,
    remainingUsefulLife: null,
    depreciationPercentage: 0,
    depreciationPerUnit: normalizeMoneyAmount(perUnit),
    method: "UNIT_OF_PRODUCTION",
  };
}

/**
 * Select depreciation formula from depreciationMethod.
 * Defaults to straight-line when method is missing (legacy rows).
 */
export function computeAssetDepreciation(
  input: AssetDepreciationInput,
): AssetDepreciationResult {
  const cost = normalizeMoneyAmount(input.purchaseCost);
  const residual = normalizeMoneyAmount(Math.max(0, input.residualValue ?? 0));
  const asOf = input.asOf ?? new Date();
  const method =
    normalizeDepreciationMethod(input.depreciationMethod) ?? "STRAIGHT_LINE";

  if (method === "REDUCING_BALANCE") {
    return computeReducingBalance(
      cost,
      residual,
      Number(input.depreciationRate) || 0,
      input.usefulLife ?? null,
      input.purchaseDate,
      asOf,
    );
  }

  if (method === "UNIT_OF_PRODUCTION") {
    return computeUnitsOfProduction(
      cost,
      residual,
      Number(input.totalEstimatedUnit) || 0,
      Number(input.unitProduced) || 0,
    );
  }

  return computeStraightLine(
    cost,
    residual,
    Number(input.usefulLife) || 0,
    input.purchaseDate,
    asOf,
  );
}

/** @deprecated Prefer computeAssetDepreciation — kept for call-site migration. */
export function computeStraightLineDepreciation(
  input: AssetDepreciationInput,
): AssetDepreciationResult {
  return computeAssetDepreciation({
    ...input,
    depreciationMethod: "STRAIGHT_LINE",
  });
}
