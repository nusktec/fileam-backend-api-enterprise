export const FILING_STATUS = ["overdue", "submitted", "paid", "pending", "draft"] as const;

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
