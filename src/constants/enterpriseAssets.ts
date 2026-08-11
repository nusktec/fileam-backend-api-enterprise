/**
 * Enterprise Asset Management — maps display classifications / methods
 * from the Assets API spec onto mobile Asset enums.
 */

export const ENTERPRISE_ASSET_CLASSIFICATIONS = [
  "Vehicle",
  "Computer Equipment",
  "Machinery",
  "Furniture",
  "Building",
  "Software License",
  "Land",
  "Other Asset",
  "Expense",
] as const;

export type EnterpriseAssetClassification =
  (typeof ENTERPRISE_ASSET_CLASSIFICATIONS)[number];

/** Spec method strings → internal enums */
export const ENTERPRISE_DEP_METHOD_TO_INTERNAL: Record<
  string,
  "STRAIGHT_LINE" | "REDUCING_BALANCE" | "UNIT_OF_PRODUCTION"
> = {
  "straight-line": "STRAIGHT_LINE",
  "reducing-balance": "REDUCING_BALANCE",
  "units-of-production": "UNIT_OF_PRODUCTION",
  STRAIGHT_LINE: "STRAIGHT_LINE",
  REDUCING_BALANCE: "REDUCING_BALANCE",
  UNIT_OF_PRODUCTION: "UNIT_OF_PRODUCTION",
};

export const INTERNAL_DEP_METHOD_TO_ENTERPRISE: Record<string, string> = {
  STRAIGHT_LINE: "straight-line",
  REDUCING_BALANCE: "reducing-balance",
  UNIT_OF_PRODUCTION: "units-of-production",
};

export const CLASSIFICATION_TO_ASSET_TYPE: Record<string, string> = {
  Vehicle: "VEHICLE",
  "Computer Equipment": "COMPUTER_IT",
  Computer: "COMPUTER_IT",
  Machinery: "MACHINERY",
  Furniture: "FURNITURE",
  Building: "BUILDING",
  "Software License": "SOFTWARE_LICENSES",
  Land: "LAND",
  "Other Asset": "OTHER_ASSET",
};

export const ASSET_TYPE_TO_CLASSIFICATION: Record<string, string> = {
  VEHICLE: "Vehicle",
  COMPUTER_IT: "Computer Equipment",
  MACHINERY: "Machinery",
  FURNITURE: "Furniture",
  BUILDING: "Building",
  SOFTWARE_LICENSES: "Software License",
  LAND: "Land",
  OTHER_ASSET: "Other Asset",
};

export function normalizeEnterpriseClassification(
  value: string,
): EnterpriseAssetClassification | null {
  const hit = ENTERPRISE_ASSET_CLASSIFICATIONS.find(
    (c) => c.toLowerCase() === value.trim().toLowerCase(),
  );
  return hit ?? null;
}

export function normalizeEnterpriseDepMethod(
  value: string | null | undefined,
): "STRAIGHT_LINE" | "REDUCING_BALANCE" | "UNIT_OF_PRODUCTION" | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return (
    ENTERPRISE_DEP_METHOD_TO_INTERNAL[key] ??
    ENTERPRISE_DEP_METHOD_TO_INTERNAL[value.trim()] ??
    null
  );
}
