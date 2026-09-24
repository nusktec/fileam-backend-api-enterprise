export const CAPITAL_ALLOWANCE_REGIME_ID = "nta-2025";
export const CAPITAL_ALLOWANCE_JURISDICTION = "Nigeria";
export const CAPITAL_ALLOWANCE_LAW = "Nigeria Tax Act 2025";
export const CAPITAL_ALLOWANCE_NAME = "Nigeria Tax Act 2025";
export const CAPITAL_ALLOWANCE_SHORT_NAME = "NTA 2025";
export const CAPITAL_ALLOWANCE_EFFECTIVE_FROM = "2026-01-01";
export const CAPITAL_ALLOWANCE_METHOD = "STRAIGHT_LINE";
export const CAPITAL_ALLOWANCE_METHOD_LABEL = "Straight-line";

export const CAPITAL_ALLOWANCE_CLASSES = [
  "CLASS_1",
  "CLASS_2",
  "CLASS_3",
] as const;
export type CapitalAllowanceClass = (typeof CAPITAL_ALLOWANCE_CLASSES)[number];

export const CAPITAL_ALLOWANCE_CLASS_LABELS: Record<
  CapitalAllowanceClass,
  string
> = {
  CLASS_1: "Class 1",
  CLASS_2: "Class 2",
  CLASS_3: "Class 3",
};

export const EXPENDITURE_TYPES = [
  "MOTOR_VEHICLE",
  "SOFTWARE",
  "OTHER_CAPITAL",
  "PLANT",
  "AGRICULTURAL_EQUIPMENT",
  "FURNITURE_FITTINGS",
  "MINING",
  "OTHER_EQUIPMENT",
  "BUILDING",
  "AGRICULTURAL",
  "MAST",
  "INTANGIBLE_ASSETS",
  "HEAVY_TRANSPORTATION",
] as const;
export type ExpenditureType = (typeof EXPENDITURE_TYPES)[number];

export function isExpenditureType(value: string): value is ExpenditureType {
  return (EXPENDITURE_TYPES as readonly string[]).includes(value);
}

export type CapitalAllowanceConfigSeed = {
  expenditureType: ExpenditureType;
  expenditureTypeLabel: string;
  capitalAllowanceClass: CapitalAllowanceClass;
  annualRate: number;
  qualifying: boolean;
};

/** NTA 2025 Table I — MVP seed (effective 1 January 2026). Lookup is by expenditureType. */
export const CAPITAL_ALLOWANCE_TABLE_I: readonly CapitalAllowanceConfigSeed[] = [
  {
    expenditureType: "BUILDING",
    expenditureTypeLabel: "Building expenditure",
    capitalAllowanceClass: "CLASS_1",
    annualRate: 0.1,
    qualifying: true,
  },
  {
    expenditureType: "AGRICULTURAL",
    expenditureTypeLabel: "Agricultural expenditure",
    capitalAllowanceClass: "CLASS_1",
    annualRate: 0.1,
    qualifying: true,
  },
  {
    expenditureType: "MAST",
    expenditureTypeLabel: "Mast expenditure",
    capitalAllowanceClass: "CLASS_1",
    annualRate: 0.1,
    qualifying: true,
  },
  {
    expenditureType: "INTANGIBLE_ASSETS",
    expenditureTypeLabel: "Intangible assets expenditure",
    capitalAllowanceClass: "CLASS_1",
    annualRate: 0.1,
    qualifying: true,
  },
  {
    expenditureType: "HEAVY_TRANSPORTATION",
    expenditureTypeLabel: "Heavy transportation expenditure",
    capitalAllowanceClass: "CLASS_1",
    annualRate: 0.1,
    qualifying: true,
  },
  {
    expenditureType: "PLANT",
    expenditureTypeLabel: "Plant expenditure",
    capitalAllowanceClass: "CLASS_2",
    annualRate: 0.2,
    qualifying: true,
  },
  {
    expenditureType: "AGRICULTURAL_EQUIPMENT",
    expenditureTypeLabel: "Agricultural equipment expenditure",
    capitalAllowanceClass: "CLASS_2",
    annualRate: 0.2,
    qualifying: true,
  },
  {
    expenditureType: "FURNITURE_FITTINGS",
    expenditureTypeLabel: "Furniture & fittings expenditure",
    capitalAllowanceClass: "CLASS_2",
    annualRate: 0.2,
    qualifying: true,
  },
  {
    expenditureType: "MINING",
    expenditureTypeLabel: "Mining expenditure",
    capitalAllowanceClass: "CLASS_2",
    annualRate: 0.2,
    qualifying: true,
  },
  {
    expenditureType: "OTHER_EQUIPMENT",
    expenditureTypeLabel: "Other equipment expenditure",
    capitalAllowanceClass: "CLASS_2",
    annualRate: 0.2,
    qualifying: true,
  },
  {
    expenditureType: "MOTOR_VEHICLE",
    expenditureTypeLabel: "Motor vehicle expenditure",
    capitalAllowanceClass: "CLASS_3",
    annualRate: 0.25,
    qualifying: true,
  },
  {
    expenditureType: "SOFTWARE",
    expenditureTypeLabel: "Software expenditure",
    capitalAllowanceClass: "CLASS_3",
    annualRate: 0.25,
    qualifying: true,
  },
  {
    expenditureType: "OTHER_CAPITAL",
    expenditureTypeLabel: "Other capital expenditure",
    capitalAllowanceClass: "CLASS_3",
    annualRate: 0.25,
    qualifying: true,
  },
];

export const CAPITAL_ALLOWANCE_INITIAL_RATE = 0;
export const CAPITAL_ALLOWANCE_RESIDUAL_RATE = 0.01;

export type CapitalAllowanceTaxFlow = "CIT" | "PIT";

export function yearOfUseLabel(yearOfUse: number): string {
  const v = yearOfUse % 100;
  let suffix = "th";
  if (v < 11 || v > 13) {
    switch (yearOfUse % 10) {
      case 1:
        suffix = "st";
        break;
      case 2:
        suffix = "nd";
        break;
      case 3:
        suffix = "rd";
        break;
      default:
        suffix = "th";
    }
  }
  return `${yearOfUse}${suffix} year of use`;
}

export function roundCapitalAllowanceNaira(value: number): number {
  return Math.round(value * 100) / 100;
}
