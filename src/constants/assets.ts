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

export const ASSET_STATUSES = [
  "ACTIVE",
  "PENDING",
  "AWAITING",
  "PENDING_REVIEW",
  "SOLD",
  "DISPOSED",
] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_STATUS = {
  ACTIVE: "ACTIVE",
  PENDING: "PENDING",
  AWAITING: "AWAITING",
  PENDING_REVIEW: "PENDING_REVIEW",
  SOLD: "SOLD",
  DISPOSED: "DISPOSED",
} as const satisfies Record<string, AssetStatus>;

/** Owned / on books — not sold or disposed. */
export const ASSET_ON_BOOKS_STATUSES: AssetStatus[] = [
  ASSET_STATUS.ACTIVE,
  ASSET_STATUS.PENDING,
  ASSET_STATUS.AWAITING,
  ASSET_STATUS.PENDING_REVIEW,
];

export function isValidAssetStatus(value: string): value is AssetStatus {
  return (ASSET_STATUSES as readonly string[]).includes(value);
}

export function isAssetOnBooks(status: string): boolean {
  return (ASSET_ON_BOOKS_STATUSES as readonly string[]).includes(status);
}

/** Unified asset timeline action types (Asset Reviews API). */
export const ASSET_HISTORY_ACTION_TYPES = [
  "ASSET_ACQUIRED",
  "SENT_TO_CONSULTANT",
  "CONFIRM_REVIEW",
  "CONSULTANT_APPROVED",
  "ASSET_TRANSFER",
  "ASSET_DISPOSAL",
] as const;

export type AssetHistoryActionType =
  (typeof ASSET_HISTORY_ACTION_TYPES)[number];

export function isValidAssetHistoryActionType(
  value: string,
): value is AssetHistoryActionType {
  return (ASSET_HISTORY_ACTION_TYPES as readonly string[]).includes(value);
}

/** PDF report types for GET /assets/reports/:reportType */
export const ASSET_REPORT_TYPES = [
  "ASSET_SUMMARY_REPORT",
  "DEPRECIATION_SCHEDULE",
  "ASSET_MOVEMENT_REPORT",
  "TAX_IMPACT_REPORT",
  "ASSET_INTELLIGENCE_REPORT",
  "CURRENT_ASSETS_STATEMENT",
] as const;

export type AssetReportType = (typeof ASSET_REPORT_TYPES)[number];

export function isValidAssetReportType(
  value: string,
): value is AssetReportType {
  return (ASSET_REPORT_TYPES as readonly string[]).includes(value);
}

export const ASSET_REPORT_DISPLAY_NAMES: Record<AssetReportType, string> = {
  ASSET_SUMMARY_REPORT: "Asset Summary Report",
  DEPRECIATION_SCHEDULE: "Depreciation Schedule",
  ASSET_MOVEMENT_REPORT: "Asset Movement Report",
  TAX_IMPACT_REPORT: "Tax Impact Report",
  ASSET_INTELLIGENCE_REPORT: "Asset Intelligence Report",
  CURRENT_ASSETS_STATEMENT: "Current Assets Statement",
};
