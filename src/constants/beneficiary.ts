/** Deduction of Tax at Source (Withholding) Regulations 2024 — beneficiary outbound WHT. */

export const BENEFICIARY_TYPES = ["VENDOR", "RECEIVING_PARTY"] as const;
export type BeneficiaryType = (typeof BENEFICIARY_TYPES)[number];

export const BENEFICIARY_ENTITY_TYPES = ["CORPORATE", "INDIVIDUAL"] as const;
export type BeneficiaryEntityType =
  (typeof BENEFICIARY_ENTITY_TYPES)[number];

export const BENEFICIARY_RESIDENCY = ["RESIDENT", "NON_RESIDENT"] as const;
export type BeneficiaryResidency = (typeof BENEFICIARY_RESIDENCY)[number];

export const VENDOR_CATEGORIES = [
  "PURCHASES",
  "DIVIDENDS",
  "INTEREST_RENT",
  "CONSULTANCY_PROFESSIONAL_FEES",
  "COMMISSIONS_BROKERAGE",
  "GENERAL_CONSTRUCTION",
  "COMPENSATION_LOSS_OF_EMPLOYMENT",
] as const;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

export const PARTY_TYPES = [
  "EMPLOYEE",
  "GOVERNMENT_TAX_AUTHORITY",
  "PENSION_STATUTORY_BODY",
  "LENDER_FINANCIAL_INSTITUTION",
  "OWNER_PARTNER",
  "SHAREHOLDER_INVESTOR",
  "DIRECTOR",
  "LANDLORD",
  "CUSTOMER",
  "AGENT_INTERMEDIARY",
  "INSURANCE_PROVIDER",
  "CHARITY_NON_PROFIT",
  "INDIVIDUAL_PERSONAL",
  "OTHER_ENTITY",
  "OTHER_RECIPIENT",
] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const WHT_CLASSES = [
  "NONE",
  "DIVIDENDS",
  "INTEREST",
  "RENT",
  "ROYALTIES",
  "DIRECTORS_FEES",
  "PROFESSIONAL_FEES",
  "COMMISSIONS",
  "CONSTRUCTION",
  "GOODS_SUPPLY",
  "COMPENSATION",
] as const;
export type WhtClass = (typeof WHT_CLASSES)[number];

export const BENEFICIARY_ENTRY_TYPES = ["INVOICE", "PAYMENT"] as const;
export type BeneficiaryEntryType = (typeof BENEFICIARY_ENTRY_TYPES)[number];

export const BENEFICIARY_INVOICE_STATUSES = ["UNPAID", "PAID"] as const;
export type BeneficiaryInvoiceStatus =
  (typeof BENEFICIARY_INVOICE_STATUSES)[number];

export const BENEFICIARY_WHT_STATUSES = ["PENDING", "REMITTED"] as const;
export type BeneficiaryWhtRemittanceStatus =
  (typeof BENEFICIARY_WHT_STATUSES)[number];

export const BENEFICIARY_WHT_BADGE_STATUSES = [
  "PENDING",
  "OVERDUE",
  "PAID",
] as const;
export type BeneficiaryWhtBadgeStatus =
  (typeof BENEFICIARY_WHT_BADGE_STATUSES)[number];

export const BENEFICIARY_DOCUMENT_KINDS = [
  "CONTRACT",
  "PURCHASE_ORDER",
  "WHT",
  "OTHER",
] as const;
export type BeneficiaryDocumentKind =
  (typeof BENEFICIARY_DOCUMENT_KINDS)[number];

export const BENEFICIARY_LIST_FILTERS = [
  "ALL",
  "VENDOR",
  "RECEIVING_PARTY",
  "WHT_DUE",
] as const;
export type BeneficiaryListFilter =
  (typeof BENEFICIARY_LIST_FILTERS)[number];

export const BENEFICIARY_DOCUMENT_CATEGORY_LABELS: Record<
  BeneficiaryDocumentKind,
  string
> = {
  CONTRACT: "Contract",
  PURCHASE_ORDER: "Purchase Order",
  WHT: "WHT Certificate",
  OTHER: "Other",
};

export const WHT_REMIT_DUE_DAY = 21;

type WhtRateRow = {
  corporate: number;
  individual: number;
  nonResident: number;
};

/** Statutory WHT rate table (percent). */
export const WHT_RATE_TABLE: Record<WhtClass, WhtRateRow> = {
  NONE: { corporate: 0, individual: 0, nonResident: 0 },
  DIVIDENDS: { corporate: 10, individual: 10, nonResident: 10 },
  INTEREST: { corporate: 10, individual: 10, nonResident: 10 },
  RENT: { corporate: 10, individual: 10, nonResident: 10 },
  ROYALTIES: { corporate: 10, individual: 10, nonResident: 10 },
  DIRECTORS_FEES: { corporate: 10, individual: 10, nonResident: 10 },
  PROFESSIONAL_FEES: { corporate: 5, individual: 5, nonResident: 10 },
  COMMISSIONS: { corporate: 5, individual: 5, nonResident: 10 },
  CONSTRUCTION: { corporate: 2, individual: 2, nonResident: 5 },
  GOODS_SUPPLY: { corporate: 2, individual: 2, nonResident: 5 },
  COMPENSATION: { corporate: 0, individual: 0, nonResident: 0 },
};

const VENDOR_CATEGORY_TO_WHT_CLASS: Record<VendorCategory, WhtClass> = {
  PURCHASES: "GOODS_SUPPLY",
  DIVIDENDS: "DIVIDENDS",
  INTEREST_RENT: "RENT",
  CONSULTANCY_PROFESSIONAL_FEES: "PROFESSIONAL_FEES",
  COMMISSIONS_BROKERAGE: "COMMISSIONS",
  GENERAL_CONSTRUCTION: "CONSTRUCTION",
  COMPENSATION_LOSS_OF_EMPLOYMENT: "COMPENSATION",
};

const PARTY_TYPE_TO_WHT_CLASS: Partial<Record<PartyType, WhtClass>> = {
  LENDER_FINANCIAL_INSTITUTION: "INTEREST",
  SHAREHOLDER_INVESTOR: "DIVIDENDS",
  DIRECTOR: "DIRECTORS_FEES",
  LANDLORD: "RENT",
  AGENT_INTERMEDIARY: "COMMISSIONS",
};

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function statutoryWhtRate(
  whtClass: WhtClass,
  entityType: BeneficiaryEntityType,
  residency: BeneficiaryResidency,
): number {
  const row = WHT_RATE_TABLE[whtClass] ?? WHT_RATE_TABLE.NONE;
  if (residency === "NON_RESIDENT") return row.nonResident;
  if (entityType === "INDIVIDUAL") return row.individual;
  return row.corporate;
}

export function defaultWhtClassForBeneficiary(input: {
  whtApplicable: boolean;
  beneficiaryType: BeneficiaryType;
  vendorCategory: string | null;
  partyType: string | null;
}): WhtClass {
  if (!input.whtApplicable) return "NONE";
  if (input.beneficiaryType === "VENDOR") {
    const cat = input.vendorCategory as VendorCategory;
    return VENDOR_CATEGORY_TO_WHT_CLASS[cat] ?? "GOODS_SUPPLY";
  }
  const party = input.partyType as PartyType;
  return PARTY_TYPE_TO_WHT_CLASS[party] ?? "NONE";
}

export function whtDueDateFromPaymentDate(dateYmd: string): string {
  const [y, m] = dateYmd.split("-").map(Number);
  let dueMonth = m + 1;
  let dueYear = y;
  if (dueMonth > 12) {
    dueMonth = 1;
    dueYear += 1;
  }
  return `${dueYear}-${String(dueMonth).padStart(2, "0")}-${String(WHT_REMIT_DUE_DAY).padStart(2, "0")}`;
}

export function computeWhtAmounts(input: {
  grossAmount: number;
  whtClass: WhtClass;
  entityType: BeneficiaryEntityType;
  residency: BeneficiaryResidency;
  whtRateOverride?: boolean;
  whtRate?: number;
}): {
  statutoryWhtRate: number;
  whtRate: number;
  whtAmount: number;
  netPayable: number;
} {
  const statRate = statutoryWhtRate(
    input.whtClass,
    input.entityType,
    input.residency,
  );
  const appliedRate = input.whtRateOverride
    ? Math.min(100, Math.max(0, input.whtRate ?? 0))
    : statRate;
  const whtAmount = roundMoney((input.grossAmount * appliedRate) / 100);
  const netPayable = roundMoney(input.grossAmount - whtAmount);
  return {
    statutoryWhtRate: statRate,
    whtRate: appliedRate,
    whtAmount,
    netPayable,
  };
}

export function deriveWhtBadgeStatus(input: {
  whtApplicable: boolean;
  outstanding: number;
  remitted: number;
  totalWht: number;
  whtDueDate: string | null;
  todayYmd: string;
}): BeneficiaryWhtBadgeStatus | null {
  if (!input.whtApplicable) return null;
  if (input.outstanding > 0) {
    if (input.whtDueDate && input.whtDueDate < input.todayYmd) {
      return "OVERDUE";
    }
    return "PENDING";
  }
  if (input.outstanding === 0 && (input.remitted > 0 || input.totalWht > 0)) {
    return "PAID";
  }
  return "PENDING";
}

export type BeneficiaryLedgerRollup = {
  totalExpense: number;
  unpaidInvoices: number;
  totalWht: number;
  outstanding: number;
  remitted: number;
  lastTransactionDate: string | null;
  whtDueDate: string | null;
};

export function computeBeneficiaryLedger(
  transactions: Array<{
    entryType: string;
    date: string;
    grossAmount: number;
    whtAmount: number;
    status: string;
    invoiceStatus: string | null;
    invoiceId: string | null;
  }>,
): BeneficiaryLedgerRollup {
  const invoices = transactions.filter((t) => t.entryType === "INVOICE");
  const payments = transactions.filter((t) => t.entryType === "PAYMENT");
  const standalonePayments = payments.filter((t) => t.invoiceId == null);

  const totalExpense = roundMoney(
    invoices.reduce((s, t) => s + t.grossAmount, 0) +
      standalonePayments.reduce((s, t) => s + t.grossAmount, 0),
  );
  const unpaidInvoices = roundMoney(
    invoices
      .filter((t) => t.invoiceStatus === "UNPAID")
      .reduce((s, t) => s + t.grossAmount, 0),
  );

  const whtLedger = payments.filter((t) => t.whtAmount > 0);
  const totalWht = roundMoney(
    whtLedger.reduce((s, t) => s + t.whtAmount, 0),
  );
  const outstanding = roundMoney(
    whtLedger
      .filter((t) => t.status === "PENDING")
      .reduce((s, t) => s + t.whtAmount, 0),
  );
  const remitted = roundMoney(
    whtLedger
      .filter((t) => t.status === "REMITTED")
      .reduce((s, t) => s + t.whtAmount, 0),
  );

  let lastTransactionDate: string | null = null;
  for (const t of transactions) {
    if (!lastTransactionDate || t.date > lastTransactionDate) {
      lastTransactionDate = t.date;
    }
  }

  const pendingWhtPayments = whtLedger.filter((t) => t.status === "PENDING");
  let whtDueDate: string | null = null;
  for (const t of pendingWhtPayments) {
    const due = whtDueDateFromPaymentDate(t.date);
    if (!whtDueDate || due < whtDueDate) whtDueDate = due;
  }

  return {
    totalExpense,
    unpaidInvoices,
    totalWht,
    outstanding,
    remitted,
    lastTransactionDate,
    whtDueDate,
  };
}

export function nextExpenseReference(existing: string[]): string {
  let max = 0;
  for (const ref of existing) {
    const m = /^EXP-(\d+)$/i.exec(ref.trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `EXP-${String(max + 1).padStart(3, "0")}`;
}
