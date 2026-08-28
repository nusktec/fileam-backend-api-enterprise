/**
 * 12-step filing workspace — source of truth for the mobile wizard.
 * Step ids 1–12; do not reorder or add steps.
 */

export const FILING_WORKSPACE_STEPS = 12;

export const WORKSPACE_TAX_PATHS = ["vat", "wht", "pit", "cit"] as const;
export type WorkspaceTaxPath = (typeof WORKSPACE_TAX_PATHS)[number];

export const WORKSPACE_TAX_TYPES = ["VAT", "WHT", "PIT", "CIT"] as const;
export type WorkspaceTaxType = (typeof WORKSPACE_TAX_TYPES)[number];

export function normalizeWorkspaceTaxPath(
  segment: string,
): WorkspaceTaxPath | null {
  const s = segment.trim().toLowerCase();
  return (WORKSPACE_TAX_PATHS as readonly string[]).includes(s)
    ? (s as WorkspaceTaxPath)
    : null;
}

export function taxTypeFromPath(path: WorkspaceTaxPath): WorkspaceTaxType {
  return path.toUpperCase() as WorkspaceTaxType;
}

export function completionPercentFromStep(step: number): number {
  const clamped = Math.min(FILING_WORKSPACE_STEPS, Math.max(1, step));
  return Math.round((clamped / FILING_WORKSPACE_STEPS) * 100);
}

export function stepFromCompletionPercent(percent: number): number {
  return Math.min(
    FILING_WORKSPACE_STEPS,
    Math.max(1, Math.round((percent / 100) * FILING_WORKSPACE_STEPS) || 1),
  );
}

export function defaultWorkspacePeriod(taxType: WorkspaceTaxType): {
  periodYear: number;
  periodMonth: number;
} {
  const now = new Date();
  if (taxType === "PIT" || taxType === "CIT") {
    return { periodYear: now.getFullYear() - 1, periodMonth: 12 };
  }
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return {
    periodYear: prev.getUTCFullYear(),
    periodMonth: prev.getUTCMonth() + 1,
  };
}

export type FilingDocumentDef = {
  id: string;
  title: string;
  subtitle?: string;
  /** payment-proof stays unavailable until receipt uploaded */
  requiresPaymentProof?: boolean;
};

export const VAT_FILING_DOCUMENTS: FilingDocumentDef[] = [
  { id: "form-002", title: "VAT Return (Form 002)", subtitle: "Official NRS monthly return (VAT 002)" },
  { id: "output-schedule", title: "Output VAT Schedule" },
  { id: "input-schedule", title: "Input VAT Schedule" },
  { id: "exempt-schedule", title: "Exempt & Zero-rated Schedule" },
  { id: "sales-ledger", title: "Sales Ledger" },
  { id: "purchase-ledger", title: "Purchase Ledger" },
  { id: "vat-summary", title: "VAT Summary" },
  { id: "payment-proof", title: "Proof of Payment", requiresPaymentProof: true },
  { id: "evidence-index", title: "Filing Evidence Index" },
];

export const WHT_FILING_DOCUMENTS: FilingDocumentDef[] = [
  { id: "wht-schedule", title: "WHT Schedule" },
  { id: "vendor-schedule", title: "Vendor Schedule" },
  { id: "credit-notes", title: "WHT Credit Notes" },
  { id: "beneficiary-list", title: "Beneficiary List" },
  { id: "remittance-schedule", title: "Remittance Schedule" },
  { id: "payment-proof", title: "Proof of Payment", requiresPaymentProof: true },
  { id: "evidence-index", title: "Filing Evidence Index" },
];

export const PIT_FILING_DOCUMENTS: FilingDocumentDef[] = [
  { id: "self-assessment", title: "Self Assessment" },
  { id: "income-schedule", title: "Income Schedule" },
  { id: "nta-deductions", title: "NTA s.30 Deductions" },
  { id: "rent-evidence", title: "Rent Evidence" },
  { id: "paye-credits", title: "PAYE Credits" },
  { id: "wht-credits", title: "WHT Credits" },
  { id: "books", title: "Books Summary" },
  { id: "bank-statements", title: "Bank Statements" },
  { id: "payment-proof", title: "Proof of Payment", requiresPaymentProof: true },
  { id: "evidence-index", title: "Filing Evidence Index" },
];

export const CIT_FILING_DOCUMENTS: FilingDocumentDef[] = [
  { id: "financials", title: "Financial Summary" },
  { id: "computation", title: "Tax Computation" },
  { id: "c08a", title: "C08A / C08C Working Paper" },
  { id: "wht-credits", title: "WHT Credits" },
  { id: "bank-statements", title: "Bank Statements" },
  { id: "sales-ledger", title: "Sales Ledger" },
  { id: "expense-records", title: "Expense Records" },
  { id: "asset-register", title: "Asset Register" },
  { id: "trial-balance", title: "Trial Balance" },
  { id: "registration", title: "Registration Details" },
  { id: "prior-assessment", title: "Prior Assessment" },
  { id: "management-accounts", title: "Management Accounts" },
  { id: "payment-evidence", title: "Payment Evidence", requiresPaymentProof: true },
];

export function documentDefsForTaxType(
  taxType: WorkspaceTaxType,
): FilingDocumentDef[] {
  switch (taxType) {
    case "VAT":
      return VAT_FILING_DOCUMENTS;
    case "WHT":
      return WHT_FILING_DOCUMENTS;
    case "PIT":
      return PIT_FILING_DOCUMENTS;
    case "CIT":
      return CIT_FILING_DOCUMENTS;
    default:
      return [];
  }
}

export const WORKSPACE_TIMELINE_EVENTS = {
  WORKSPACE_STARTED: "WORKSPACE_STARTED",
  COMPUTATION_CONFIRMED: "COMPUTATION_CONFIRMED",
  TAXGPT_VALIDATED: "TAXGPT_VALIDATED",
  DOCUMENTS_GENERATED: "DOCUMENTS_GENERATED",
  SUBMITTED: "SUBMITTED",
  PROOF_UPLOADED: "PROOF_UPLOADED",
  PAYMENT_RECORDED: "PAYMENT_RECORDED",
  RECEIPT_UPLOADED: "RECEIPT_UPLOADED",
  COMPLIANT: "COMPLIANT",
} as const;

export type PitDraftInputs = {
  incomeOverrides?: {
    tradingProfit?: number;
    otherBusinessIncome?: number;
    otherPersonalIncome?: number;
  };
  payerFeesIncludedInSales?: boolean;
  reliefs?: {
    annualRent?: number;
    extraPension?: number;
    nhfContribution?: number;
    nhisContribution?: number;
    lifeAssurance?: number;
    mortgageInterest?: number;
    pensionOverride?: number | null;
    nhfOverride?: number | null;
    rentPeriodStart?: string;
    rentPeriodEnd?: string;
    landlordName?: string;
    landlordContact?: string;
    propertyAddress?: string;
  };
  incomeReviewed?: boolean;
  reliefsReviewed?: boolean;
};

export type CitDraftInputs = {
  adjustments?: {
    depreciation?: number;
    fines?: number;
    directorsPersonal?: number;
    otherNonAllowable?: number;
    frankedDividends?: number;
    chargeableGains?: number;
    lossCarryForward?: number;
    whtCredits?: number;
  };
};

export type TaxGptValidationResult = {
  validatedAt: string;
  status: "pass" | "warn" | "fail";
  summary: string;
  checks: Array<{
    id: string;
    label: string;
    severity: "pass" | "warn" | "fail";
    message: string;
  }>;
};
