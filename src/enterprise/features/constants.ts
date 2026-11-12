export const PIPELINE_STAGES = {
  IMPORTED: "IMPORTED",
  REVIEWED: "REVIEWED",
  ADJUSTED: "ADJUSTED",
  FINALIZED: "FINALIZED",
} as const;

export type PipelineStage =
  (typeof PIPELINE_STAGES)[keyof typeof PIPELINE_STAGES];

export const PIPELINE_ADVANCE_STAGES: PipelineStage[] = [
  PIPELINE_STAGES.REVIEWED,
  PIPELINE_STAGES.ADJUSTED,
  PIPELINE_STAGES.FINALIZED,
];

export const RECORD_TYPES = {
  SALE: "sale",
  EXPENSE: "expense",
} as const;

export const AUDIT_EVENT_TYPES = {
  DELETED: "deleted",
  RESET: "reset",
} as const;

export const AUDIT_CATEGORIES = {
  INCOME: "Income",
  EXPENSE: "Expense",
} as const;

export const ACTOR_TYPES = {
  MOBILE_USER: "mobile_user",
  CONSULTANT: "consultant",
} as const;

export const HIGH_RISK_AMOUNT = 500_000;

export const HEALTH_WEIGHTS = {
  profitability: 0.3,
  cashFlow: 0.2,
  revenueStability: 0.15,
  expenseControl: 0.15,
  taxCompliance: 0.1,
  liquidity: 0.1,
} as const;

export const VAT_REGISTRATION_STATUSES = [
  "registered",
  "not-registered",
  "exempt",
] as const;

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
