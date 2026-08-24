export const FILING_STATUS = [
  "overdue",
  "submitted",
  "paid",
  "pending",
  "draft",
] as const;

/** Values accepted on filing submit bodies (case-insensitive "Paid" also accepted in controllers). */
export const FILING_PAYMENT_STATUSES = ["paid", "not_paid"] as const;

export type FilingPaymentStatus = (typeof FILING_PAYMENT_STATUSES)[number];

/** How /mobile/filings/tax/:taxType/preview behaves for each built-in tax code. */
export const TAX_FILING_PREVIEW_KIND = {
  VAT: "calculation",
  WHT: "schedule",
  CIT: "calculation",
  PAYE: "manual",
  PIT: "calculation",
} as const;

export type TaxFilingPreviewKind =
  (typeof TAX_FILING_PREVIEW_KIND)[keyof typeof TAX_FILING_PREVIEW_KIND];

export const FILING_TIMELINE_EVENTS = {
  DRAFT_CREATED: "draft_created",
  REVIEWED_VALIDATED: "reviewed_validated",
  SUBMITTED_TO_FIRS: "submitted_to_firs",
  PAYMENT_CONFIRMED: "payment_confirmed",
} as const;

export const REPORT_TYPES = [
  "VAT Return Summary",
  "WHT Schedule Report",
  "Filing History",
  "Compliance Summary",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];
