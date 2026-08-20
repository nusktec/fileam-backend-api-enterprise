export const UNIT_ATTRIBUTION_PERIOD_TYPES = [
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
] as const;

export type UnitAttributionPeriodType =
  (typeof UNIT_ATTRIBUTION_PERIOD_TYPES)[number];

export function isValidUnitAttributionPeriodType(
  value: string,
): value is UnitAttributionPeriodType {
  return (UNIT_ATTRIBUTION_PERIOD_TYPES as readonly string[]).includes(value);
}

export const PRODUCTION_RECORD_STATUS = {
  RECORDED: "RECORDED",
  OPEN: "OPEN",
} as const;

export type ProductionRecordStatus =
  (typeof PRODUCTION_RECORD_STATUS)[keyof typeof PRODUCTION_RECORD_STATUS];
