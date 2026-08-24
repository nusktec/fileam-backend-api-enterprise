/**
 * NTA 2025 Companies Income Tax filing — annual self-assessment for LTD companies.
 * s.56: small company 0%, any other company 30%.
 * s.59: 4% development levy on assessable profit (not chargeable profit).
 * s.201: small company turnover ≤ ₦100m AND fixed assets ≤ ₦250m.
 */

import { PERCENT } from "./percentages";

export const CIT_PERIOD_MONTH = 12;
export const CIT_FILING_DUE_MONTH = 6;
export const CIT_FILING_DUE_DAY = 30;
export const CIT_YEAR_END_MONTH = 12;
export const CIT_YEAR_END_DAY = 31;

/** NTA 2025 s.201 — gross turnover cap for small company. */
export const CIT_SMALL_COMPANY_TURNOVER_CAP_NGN = 100_000_000;
/** NTA 2025 s.201 — total fixed assets cap for small company. */
export const CIT_SMALL_COMPANY_FIXED_ASSETS_CAP_NGN = 250_000_000;

export const CIT_SMALL_COMPANY_RATE_PERCENT = 0;
export const CIT_STANDARD_RATE_PERCENT = 30;
export const CIT_DEVELOPMENT_LEVY_RATE = 0.04;
export const CIT_DEVELOPMENT_LEVY_RATE_PERCENT = 4;

export const CIT_TAX_CLASS = {
  SMALL: "C08C",
  LARGE: "C08A",
} as const;

export type CitTaxClassCode =
  (typeof CIT_TAX_CLASS)[keyof typeof CIT_TAX_CLASS];

/** First Schedule Table I — straight-line annual rates (fraction). */
export const CIT_CAPITAL_ALLOWANCE_RATES: Record<
  string,
  { rate: number; category: string }
> = {
  VEHICLE: { rate: 0.25, category: "Motor Vehicles" },
  SOFTWARE_LICENSES: { rate: 0.25, category: "Software" },
  OTHER_ASSET: { rate: 0.25, category: "Other capital expenditure" },
  COMPUTER_IT: { rate: 0.2, category: "Plant & equipment" },
  MACHINERY: { rate: 0.2, category: "Plant & equipment" },
  FURNITURE: { rate: 0.2, category: "Furniture & fittings" },
  BUILDING: { rate: 0.1, category: "Buildings" },
  LAND: { rate: 0, category: "Land" },
};

const PROFESSIONAL_SERVICES_PATTERN =
  /\b(law|legal|accounting|accountant|audit|tax consult|architecture|architect|engineering consult|medical practice|medical|clinic|doctor)\b/i;

export type CitAllowanceRow = {
  id: string;
  name: string;
  category: string;
  cost: number;
  annualRate: number;
  claimedThisYear: number;
};

export type CitAdjustmentsInput = {
  fines?: number;
  directorsPersonal?: number;
  otherNonAllowable?: number;
  entertainment?: number;
  frankedDividends?: number;
  chargeableGains?: number;
  capitalGains?: number;
};

export type CitComputationSnapshot = {
  year: number;
  turnover: number;
  fixedAssets: number;
  taxClassCode: CitTaxClassCode;
  taxClassLabel: string;
  isSmallCompany: boolean;
  accountingProfit: number;
  depreciation: number;
  fines: number;
  directorsPersonal: number;
  otherNonAllowable: number;
  totalAddBacks: number;
  frankedDividends: number;
  assessableProfit: number;
  chargeableGains: number;
  capitalAllowancesAvailable: number;
  capitalAllowancesClaimed: number;
  unutilizedCapitalAllowances: number;
  lossCarryForward: number;
  chargeableProfit: number;
  citRate: number;
  levyRate: number;
  citAmount: number;
  developmentLevy: number;
  grossCit: number;
  whtCredits: number;
  whtApplied: number;
  unutilizedWhtCredits: number;
  citPayable: number;
  rcNumber: string;
  tin: string;
  companyName: string;
  allowances: CitAllowanceRow[];
};

export function roundCitNaira(value: number): number {
  return Math.round(value);
}

export function citDueDateForYear(periodYear: number): string {
  return `${periodYear + 1}-${String(CIT_FILING_DUE_MONTH).padStart(2, "0")}-${String(CIT_FILING_DUE_DAY).padStart(2, "0")}`;
}

export function citYearEndForYear(periodYear: number): string {
  return `${periodYear}-${String(CIT_YEAR_END_MONTH).padStart(2, "0")}-${String(CIT_YEAR_END_DAY).padStart(2, "0")}`;
}

export function isCitYearOpenForFiling(
  periodYear: number,
  today = new Date(),
): boolean {
  return periodYear < today.getFullYear();
}

export function isProfessionalServicesBusiness(
  businessType?: string | null,
  sector?: string | null,
): boolean {
  const text = `${businessType ?? ""} ${sector ?? ""}`.trim();
  if (!text) return false;
  return PROFESSIONAL_SERVICES_PATTERN.test(text);
}

export function classifySmallCompany(input: {
  turnover: number;
  fixedAssets: number;
  businessType?: string | null;
  sector?: string | null;
}): {
  isSmallCompany: boolean;
  taxClassCode: CitTaxClassCode;
  taxClassLabel: string;
  citRate: number;
  levyRate: number;
} {
  const turnover = Math.max(0, input.turnover);
  const fixedAssets = Math.max(0, input.fixedAssets);
  const professional = isProfessionalServicesBusiness(
    input.businessType,
    input.sector,
  );
  const isSmall =
    !professional &&
    turnover <= CIT_SMALL_COMPANY_TURNOVER_CAP_NGN &&
    fixedAssets <= CIT_SMALL_COMPANY_FIXED_ASSETS_CAP_NGN;

  return {
    isSmallCompany: isSmall,
    taxClassCode: isSmall ? CIT_TAX_CLASS.SMALL : CIT_TAX_CLASS.LARGE,
    taxClassLabel: isSmall ? "Small Company" : "Large Company",
    citRate: isSmall ? CIT_SMALL_COMPANY_RATE_PERCENT : CIT_STANDARD_RATE_PERCENT,
    levyRate: isSmall ? 0 : CIT_DEVELOPMENT_LEVY_RATE_PERCENT,
  };
}

export function capitalAllowanceRateForAssetType(assetType: string): {
  rate: number;
  category: string;
} {
  const key = assetType.trim().toUpperCase();
  return (
    CIT_CAPITAL_ALLOWANCE_RATES[key] ?? CIT_CAPITAL_ALLOWANCE_RATES.OTHER_ASSET
  );
}

export function computeCapitalAllowanceForAsset(
  asset: {
    id: string;
    name: string;
    assetType: string;
    cost: number;
    purchaseDate: string;
    status: string;
  },
  taxYear: number,
): CitAllowanceRow | null {
  const status = asset.status.trim().toUpperCase();
  if (status === "SOLD" || status === "DISPOSED") return null;
  const cost = Math.max(0, asset.cost);
  if (cost <= 0) return null;

  const { rate, category } = capitalAllowanceRateForAssetType(asset.assetType);
  if (rate <= 0) return null;

  const purchaseYear = parseInt(asset.purchaseDate.slice(0, 4), 10);
  const yearsHeld = taxYear - purchaseYear;
  if (yearsHeld < 0) return null;

  const annualOnCost = roundCitNaira(cost * rate);
  const cumulativePrior = annualOnCost * yearsHeld;
  const residueStart = Math.max(0, cost - cumulativePrior);
  if (residueStart === 0) return null;

  const claimedThisYear = Math.min(annualOnCost, residueStart);
  return {
    id: asset.id,
    name: asset.name,
    category,
    cost,
    annualRate: rate,
    claimedThisYear,
  };
}

export function computeCitFromSnapshot(
  input: {
    year: number;
    turnover: number;
    fixedAssets: number;
    accountingProfit: number;
    depreciation: number;
    lossCarryForward: number;
    capitalAllowancesAvailable: number;
    whtCredits: number;
    rcNumber: string;
    tin: string;
    companyName: string;
    businessType?: string | null;
    sector?: string | null;
    allowances?: CitAllowanceRow[];
  } & CitAdjustmentsInput,
): CitComputationSnapshot {
  const classification = classifySmallCompany({
    turnover: input.turnover,
    fixedAssets: input.fixedAssets,
    businessType: input.businessType,
    sector: input.sector,
  });

  const fines = Math.max(0, input.fines ?? 0);
  const directorsPersonal = Math.max(0, input.directorsPersonal ?? 0);
  const otherNonAllowable =
    Math.max(0, input.otherNonAllowable ?? 0) +
    Math.max(0, input.entertainment ?? 0);
  const depreciation = Math.max(0, input.depreciation);
  const frankedDividends = Math.max(0, input.frankedDividends ?? 0);
  const chargeableGains = Math.max(
    0,
    input.chargeableGains ?? input.capitalGains ?? 0,
  );

  const totalAddBacks =
    depreciation + fines + directorsPersonal + otherNonAllowable;
  const assessableProfitRaw =
    input.accountingProfit + totalAddBacks - frankedDividends;
  const levyBase = Math.max(0, assessableProfitRaw);
  const assessableProfit = levyBase;

  const lossCarryForward = Math.max(0, input.lossCarryForward);
  const capitalAllowancesAvailable = Math.max(
    0,
    input.capitalAllowancesAvailable,
  );

  const afterGains = assessableProfitRaw + chargeableGains;
  const afterLosses = afterGains - lossCarryForward;
  const capitalAllowancesClaimed = Math.min(
    capitalAllowancesAvailable,
    Math.max(0, afterLosses),
  );
  const unutilizedCapitalAllowances =
    capitalAllowancesAvailable - capitalAllowancesClaimed;
  const chargeableProfit = Math.max(0, afterLosses - capitalAllowancesClaimed);

  const citAmount = roundCitNaira(
    chargeableProfit * (classification.citRate / PERCENT),
  );
  const developmentLevy = classification.isSmallCompany
    ? 0
    : roundCitNaira(levyBase * CIT_DEVELOPMENT_LEVY_RATE);
  const grossCit = citAmount + developmentLevy;

  const whtCredits = Math.max(0, input.whtCredits);
  const whtApplied = Math.min(whtCredits, citAmount);
  const unutilizedWhtCredits = whtCredits - whtApplied;
  const citPayable = citAmount - whtApplied + developmentLevy;

  return {
    year: input.year,
    turnover: Math.max(0, input.turnover),
    fixedAssets: Math.max(0, input.fixedAssets),
    taxClassCode: classification.taxClassCode,
    taxClassLabel: classification.taxClassLabel,
    isSmallCompany: classification.isSmallCompany,
    accountingProfit: input.accountingProfit,
    depreciation,
    fines,
    directorsPersonal,
    otherNonAllowable,
    totalAddBacks,
    frankedDividends,
    assessableProfit,
    chargeableGains,
    capitalAllowancesAvailable,
    capitalAllowancesClaimed,
    unutilizedCapitalAllowances,
    lossCarryForward,
    chargeableProfit,
    citRate: classification.citRate,
    levyRate: classification.levyRate,
    citAmount,
    developmentLevy,
    grossCit,
    whtCredits,
    whtApplied,
    unutilizedWhtCredits,
    citPayable,
    rcNumber: input.rcNumber,
    tin: input.tin,
    companyName: input.companyName,
    allowances: input.allowances ?? [],
  };
}

export function amountsMatch(a: number, b: number, tolerance = 1): boolean {
  return Math.abs(a - b) <= tolerance;
}
