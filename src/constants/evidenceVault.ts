/** Evidence Vault categories (mobile). Do not rename silently — coordinate with frontend. */
export const EVIDENCE_VAULT_CATEGORIES = [
  "Sales-Transactions",
  "Purchase-Invoices",
  "Expense-Transactions",
  "Assets",
  "Payroll",
  "Tax-Filings",
  "Bank-Statement-Analysis",
  "Accounts-Receivable",
  "Accounts-Payable",
  "Inventory-Transactions",
  "Ledger-Watch-Findings",
] as const;

export type EvidenceVaultCategory = (typeof EVIDENCE_VAULT_CATEGORIES)[number];

export const EVIDENCE_VAULT_CATEGORY_FILTERS = [
  "all",
  ...EVIDENCE_VAULT_CATEGORIES,
] as const;

export type EvidenceVaultCategoryFilter =
  (typeof EVIDENCE_VAULT_CATEGORY_FILTERS)[number];

const CATEGORY_SET = new Set<string>(EVIDENCE_VAULT_CATEGORIES);

/** Normalize query/body category; accepts exact hyphenated names (case-insensitive). */
export function normalizeEvidenceVaultCategory(
  value: string | undefined | null,
): EvidenceVaultCategory | "all" | null {
  if (value == null || String(value).trim() === "") return "all";
  const raw = String(value).trim();
  if (raw.toLowerCase() === "all") return "all";

  const hit = EVIDENCE_VAULT_CATEGORIES.find(
    (c) => c.toLowerCase() === raw.toLowerCase(),
  );
  if (hit) return hit;

  // Legacy filter keys from previous vault API
  const legacy: Record<string, EvidenceVaultCategory> = {
    invoices: "Sales-Transactions",
    receipts: "Expense-Transactions",
    vat_schedules: "Tax-Filings",
    wht_notes: "Tax-Filings",
    filings: "Tax-Filings",
  };
  const mapped = legacy[raw.toLowerCase()];
  return mapped ?? null;
}

export function isEvidenceVaultCategory(
  value: string,
): value is EvidenceVaultCategory {
  return CATEGORY_SET.has(value);
}

export function saleLinkedRecordDocumentId(invoiceNumber: string): string {
  return `SALE-DOC-${invoiceNumber}`;
}

export function expenseLinkedRecordDocumentId(expenseNumber: string): string {
  return `EXP-DOC-${expenseNumber}`;
}

export function assetLinkedRecordDocumentId(assetCode: string): string {
  return `ASSET-DOC-${assetCode}`;
}

export function payrollLinkedRecordDocumentId(
  type: string,
  period: string,
): string {
  return `PAYROLL-DOC-${type}-${period}`;
}

export function taxLinkedRecordDocumentId(
  taxType: string,
  periodYear: number,
  periodMonth: number,
): string {
  return `TAX-DOC-${taxType}-${periodYear}-${String(periodMonth).padStart(2, "0")}`;
}

export function reportLinkedRecordDocumentId(reportId: string): string {
  return `REPORT-DOC-${reportId.slice(0, 8).toUpperCase()}`;
}

export function inventorySaleLinkedRecordDocumentId(saleId: string): string {
  return `INV-DOC-${saleId.slice(0, 8).toUpperCase()}`;
}

export function makeDocumentRef(entityId: string, prefix = "DOC"): string {
  return `${prefix}-${entityId.slice(0, 8).toUpperCase()}`;
}
