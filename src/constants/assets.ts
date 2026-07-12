export const ASSET_TYPES = [
  "VEHICLE",
  "COMPUTER_IT",
  "MACHINERY",
  "FURNITURE",
  "BUILDING",
  "SOFTWARE_LICENSES",
  "LAND",
  "OTHER_ASSET",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export function isValidAssetType(value: string): value is AssetType {
  return (ASSET_TYPES as readonly string[]).includes(value);
}

export const DEPRECIATION_METHODS = [
  "STRAIGHT_LINE",
  "DECLINING_BALANCE",
  "UNITS_OF_PRODUCTION",
] as const;

export type DepreciationMethod = (typeof DEPRECIATION_METHODS)[number];

export function isValidDepreciationMethod(
  value: string,
): value is DepreciationMethod {
  return (DEPRECIATION_METHODS as readonly string[]).includes(value);
}

export const TRANSFER_TYPES = [
  "BRANCH_TRANSFER",
  "DEPARTMENT_TRANSFER",
  "EMPLOYEE_TRANSFER",
] as const;

export type TransferType = (typeof TRANSFER_TYPES)[number];

export function isValidTransferType(value: string): value is TransferType {
  return (TRANSFER_TYPES as readonly string[]).includes(value);
}

export const TRANSFER_STATUSES = [
  "PENDING",
  "COMPLETED",
  "CANCELLED",
] as const;

export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export function isValidTransferStatus(value: string): value is TransferStatus {
  return (TRANSFER_STATUSES as readonly string[]).includes(value);
}

export const DISPOSAL_REASONS = [
  "DAMAGED",
  "STOLEN",
  "LOST",
  "OBSOLETE",
  "DESTROYED",
  "EXPIRED_LICENSE",
] as const;

export type DisposalReason = (typeof DISPOSAL_REASONS)[number];

export function isValidDisposalReason(value: string): value is DisposalReason {
  return (DISPOSAL_REASONS as readonly string[]).includes(value);
}

export const GAIN_LOSS_TYPES = ["GAIN", "LOSS", "BREAK_EVEN"] as const;

export type GainLossType = (typeof GAIN_LOSS_TYPES)[number];

export function isValidGainLossType(value: string): value is GainLossType {
  return (GAIN_LOSS_TYPES as readonly string[]).includes(value);
}

export const CONSULTANT_REVIEW_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;

export type ConsultantReviewStatus =
  (typeof CONSULTANT_REVIEW_STATUSES)[number];

export function isValidConsultantReviewStatus(
  value: string,
): value is ConsultantReviewStatus {
  return (CONSULTANT_REVIEW_STATUSES as readonly string[]).includes(value);
}

export const ASSET_STATUSES = ["ACTIVE", "SOLD", "DISPOSED"] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

export function isValidAssetStatus(value: string): value is AssetStatus {
  return (ASSET_STATUSES as readonly string[]).includes(value);
}
