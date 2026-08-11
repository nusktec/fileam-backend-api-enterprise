import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { HttpReplyError } from "../../utils/httpReplyError";
import { coerceInvoiceAmountPaid } from "../../constants/invoiceAmountPaid";
import {
  EVIDENCE_VAULT_CATEGORIES,
  EvidenceVaultCategory,
  assetLinkedRecordDocumentId,
  expenseLinkedRecordDocumentId,
  makeDocumentRef,
  normalizeEvidenceVaultCategory,
  payrollLinkedRecordDocumentId,
  reportLinkedRecordDocumentId,
  saleLinkedRecordDocumentId,
  taxLinkedRecordDocumentId,
} from "../../constants/evidenceVault";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

/**
 * uploadedBy is always a plain string (never an object).
 * - Manual create with body.uploadedBy → exact string supplied
 * - Manual create without uploadedBy → business name
 * - Auto-aggregated evidence → business name
 */
export type VaultDocument = {
  id: string;
  documentId: string;
  name: string;
  category: string;
  source: string;
  date: Date;
  fileSizeKb: number | null;
  documentUrl: string | null;
  evidenceVaultId: string | null;
  downloadPath?: string | null;
  linkedRecord: string | null;
  linkedRecordName: string | null;
  linkedRecordDocumentId: string | null;
  uploadedBy: string;
  uploadedDate: Date;
  linkedDocumentCreationDate: Date | null;
};

export type VaultRecord = {
  id: string;
  name: string;
  amount: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildDedupeKey(
  category: string,
  linkedKey: string,
  documentUrl: string | null | undefined,
  kind?: string,
): string {
  const urlPart = (documentUrl ?? "").trim().toLowerCase() || kind || "default";
  return `${category}|${linkedKey}|${urlPart}`;
}

/** Business name for the vault owner (auto evidence + create fallback). */
async function resolveBusinessName(userId: string): Promise<string> {
  const [business, user] = await Promise.all([
    prisma.business.findFirst({
      where: { userId },
      select: { name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        organizationName: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    }),
  ]);
  const fromBusiness = business?.name?.trim();
  if (fromBusiness) return fromBusiness;
  const fromOrg = user?.organizationName?.trim();
  if (fromOrg) return fromOrg;
  const fromName = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();
  if (fromName) return fromName;
  return user?.email?.trim() || "Unknown";
}

/**
 * Persist/return uploadedBy as a display string.
 * Legacy rows that stored a user UUID fall back to business name.
 */
function normalizeUploadedByString(
  raw: string | null | undefined,
  businessName: string,
): string {
  const value = raw?.trim();
  if (!value || UUID_RE.test(value)) return businessName;
  return value;
}

function toVaultFromRow(
  row: {
    id: string;
    documentId: string;
    name: string;
    category: string;
    source: string;
    date: Date;
    fileSizeKb: number | null;
    documentUrl: string | null;
    evidenceVaultId: string | null;
    linkedRecord: string | null;
    linkedRecordName: string | null;
    linkedRecordDocumentId: string | null;
    uploadedBy: string | null;
    uploadedDate: Date;
    linkedDocumentCreationDate: Date | null;
  },
  businessName: string,
): VaultDocument {
  const id = `doc-${row.id}`;
  return {
    id,
    documentId: row.documentId,
    name: row.name,
    category: row.category,
    source: row.source,
    date: row.date,
    fileSizeKb: row.fileSizeKb,
    documentUrl: row.documentUrl,
    evidenceVaultId: row.evidenceVaultId ?? row.id,
    downloadPath: !row.documentUrl
      ? `/mobile/evidence-vault/documents/${id}/download`
      : null,
    linkedRecord: row.linkedRecord,
    linkedRecordName: row.linkedRecordName,
    linkedRecordDocumentId: row.linkedRecordDocumentId,
    uploadedBy: normalizeUploadedByString(row.uploadedBy, businessName),
    uploadedDate: row.uploadedDate,
    linkedDocumentCreationDate: row.linkedDocumentCreationDate,
  };
}

function pushDoc(
  docs: VaultDocument[],
  seen: Set<string>,
  doc: VaultDocument,
  searchLower?: string,
): void {
  if (searchLower) {
    const hay = [
      doc.name,
      doc.documentId,
      doc.linkedRecordName,
      doc.linkedRecordDocumentId,
      doc.category,
      doc.source,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(searchLower)) return;
  }
  const key = buildDedupeKey(
    doc.category,
    doc.linkedRecord ?? doc.linkedRecordDocumentId ?? doc.id,
    doc.documentUrl,
    doc.id,
  );
  if (seen.has(key)) return;
  seen.add(key);
  docs.push(doc);
}

type ResolvedLink = {
  linkedRecord: string;
  linkedRecordName: string;
  linkedRecordDocumentId: string;
  linkedDocumentCreationDate: Date;
  source: string;
  name: string;
  date: Date;
};

/** Resolve create payload linkedRecord (e.g. sale-{uuid}) to the underlying entity. */
async function resolveByLinkedRecord(
  userId: string,
  category: EvidenceVaultCategory,
  linkedRecord: string,
): Promise<ResolvedLink | null> {
  const ref = linkedRecord.trim();

  if (category === "Sales-Transactions" || category === "Accounts-Receivable") {
    if (!ref.startsWith("sale-") || ref.startsWith("sale-receipt-")) return null;
    const id = ref.slice("sale-".length);
    if (!UUID_RE.test(id)) return null;
    const sale = await prisma.sale.findFirst({ where: { id, userId } });
    if (!sale) return null;
    const name = `Invoice ${sale.invoiceNumber}${sale.customerName ? ` - ${sale.customerName}` : ""}`;
    return {
      linkedRecord: `sale-${sale.id}`,
      linkedRecordName: name,
      linkedRecordDocumentId: saleLinkedRecordDocumentId(sale.invoiceNumber),
      linkedDocumentCreationDate: sale.saleDate,
      source: "Sales",
      name,
      date: sale.saleDate,
    };
  }

  if (
    category === "Expense-Transactions" ||
    category === "Purchase-Invoices" ||
    category === "Accounts-Payable"
  ) {
    const expenseId = ref.match(
      /^expense-(?:purchase-)?([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
    )?.[1];
    if (!expenseId) return null;
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, userId },
    });
    if (!expense) return null;
    const name = expense.description;
    return {
      linkedRecord: `expense-${expense.id}`,
      linkedRecordName: name,
      linkedRecordDocumentId: expenseLinkedRecordDocumentId(expense.expenseNumber),
      linkedDocumentCreationDate: expense.expenseDate,
      source: "Expenses",
      name: `Receipt - ${name}`,
      date: expense.expenseDate,
    };
  }

  if (category === "Assets") {
    const assetId = ref.match(
      /^asset-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
    )?.[1];
    if (!assetId) return null;
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, userId },
    });
    if (!asset) return null;
    return {
      linkedRecord: `asset-${asset.id}`,
      linkedRecordName: asset.assetName,
      linkedRecordDocumentId: assetLinkedRecordDocumentId(asset.assetCode),
      linkedDocumentCreationDate: asset.purchaseDate,
      source: "Assets",
      name: `Asset evidence - ${asset.assetName}`,
      date: asset.purchaseDate,
    };
  }

  if (category === "Payroll") {
    const payrollId = ref.match(
      /^payroll-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
    )?.[1];
    if (!payrollId) return null;
    const row = await prisma.payrollObligation.findFirst({
      where: { id: payrollId, userId },
    });
    if (!row) return null;
    const name = `${row.type} ${row.period}`;
    return {
      linkedRecord: `payroll-${row.id}`,
      linkedRecordName: name,
      linkedRecordDocumentId: payrollLinkedRecordDocumentId(row.type, row.period),
      linkedDocumentCreationDate: row.createdAt,
      source: "Payroll",
      name: `Payroll evidence - ${name}`,
      date: row.dueDate,
    };
  }

  if (category === "Tax-Filings") {
    if (ref.startsWith("payable-") && !ref.startsWith("payable-receipt-")) {
      const id = ref.slice("payable-".length);
      if (!UUID_RE.test(id)) return null;
      const payable = await prisma.taxPayable.findFirst({
        where: { id, userId },
      });
      if (!payable) return null;
      const periodLabel = `${new Date(payable.periodYear, payable.periodMonth - 1).toLocaleString("default", { month: "short" })} ${payable.periodYear}`;
      const name = `${payable.taxType} Filing ${periodLabel}`;
      return {
        linkedRecord: `payable-${payable.id}`,
        linkedRecordName: name,
        linkedRecordDocumentId: taxLinkedRecordDocumentId(
          payable.taxType,
          payable.periodYear,
          payable.periodMonth,
        ),
        linkedDocumentCreationDate: payable.createdAt,
        source: "Filings",
        name,
        date: payable.submittedAt || payable.createdAt,
      };
    }
    if (ref.startsWith("report-")) {
      const id = ref.slice("report-".length);
      if (!UUID_RE.test(id)) return null;
      const report = await prisma.report.findFirst({
        where: { id, userId },
      });
      if (!report) return null;
      const name = `${report.reportType} - ${report.periodLabel}`;
      return {
        linkedRecord: `report-${report.id}`,
        linkedRecordName: name,
        linkedRecordDocumentId: reportLinkedRecordDocumentId(report.id),
        linkedDocumentCreationDate: report.generatedAt,
        source: "Reports",
        name,
        date: report.generatedAt,
      };
    }
  }

  if (category === "Inventory-Transactions") {
    if (!ref.startsWith("inventory-sale-")) return null;
    const id = ref.slice("inventory-sale-".length);
    if (!UUID_RE.test(id)) return null;
    const sale = await prisma.inventorySale.findFirst({
      where: { id, userId },
    });
    if (!sale) return null;
    const name = sale.customerName
      ? `Inventory sale - ${sale.customerName}`
      : `Inventory sale ${sale.id.slice(0, 8)}`;
    return {
      linkedRecord: `inventory-sale-${sale.id}`,
      linkedRecordName: name,
      linkedRecordDocumentId: `INV-DOC-${sale.id.slice(0, 8).toUpperCase()}`,
      linkedDocumentCreationDate: sale.soldAt,
      source: "Inventory",
      name,
      date: sale.soldAt,
    };
  }

  return null;
}

export const evidenceVaultService = {
  async listDocuments(
    userId: string,
    filters?: {
      search?: string;
      category?: string;
      dateFrom?: Date;
      dateTo?: Date;
    },
  ): Promise<VaultDocument[]> {
    const docs: VaultDocument[] = [];
    const seen = new Set<string>();
    const searchLower = filters?.search?.toLowerCase().trim();
    const categoryNorm = normalizeEvidenceVaultCategory(filters?.category);
    if (categoryNorm === null) {
      throw new HttpReplyError(
        400,
        `Invalid category. Must be one of: all, ${EVIDENCE_VAULT_CATEGORIES.join(", ")}`,
      );
    }

    const businessName = await resolveBusinessName(userId);
    const saleWhere: { userId: string; saleDate?: { gte?: Date; lte?: Date } } =
      { userId };
    const expenseWhere: {
      userId: string;
      expenseDate?: { gte?: Date; lte?: Date };
    } = { userId };
    const reportWhere: {
      userId: string;
      generatedAt?: { gte?: Date; lte?: Date };
    } = { userId };
    if (filters?.dateFrom || filters?.dateTo) {
      const r = { gte: filters.dateFrom, lte: filters.dateTo };
      saleWhere.saleDate = { ...r };
      expenseWhere.expenseDate = { ...r };
      reportWhere.generatedAt = { ...r };
    }

    const [
      sales,
      expenses,
      payables,
      reports,
      assets,
      disposals,
      payrollRows,
      stored,
    ] = await Promise.all([
      prisma.sale.findMany({
        where: saleWhere,
        orderBy: [{ saleDate: "desc" }, { createdAt: "desc" }],
      }),
      prisma.expense.findMany({
        where: expenseWhere,
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      }),
      prisma.taxPayable.findMany({
        where: { userId },
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      }),
      prisma.report.findMany({
        where: reportWhere,
        orderBy: { generatedAt: "desc" },
      }),
      prisma.asset.findMany({
        where: { userId },
        orderBy: { purchaseDate: "desc" },
      }),
      prisma.assetDisposal.findMany({
        where: { userId },
        include: { asset: { select: { assetName: true, assetCode: true } } },
        orderBy: { disposalDate: "desc" },
      }),
      prisma.payrollObligation.findMany({
        where: { userId },
        orderBy: { period: "desc" },
      }),
      prisma.evidenceVaultDocument.findMany({
        where: { userId },
        orderBy: { uploadedDate: "desc" },
      }),
    ]);

    for (const s of sales) {
      const name = `Invoice ${s.invoiceNumber}${s.customerName ? ` - ${s.customerName}` : ""}`;
      const linkedRecordDocumentId = saleLinkedRecordDocumentId(s.invoiceNumber);
      const docId = `sale-${s.id}`;
      pushDoc(
        docs,
        seen,
        {
          id: docId,
          documentId: makeDocumentRef(s.id),
          name,
          category: "Sales-Transactions",
          source: "Sales",
          date: s.saleDate,
          fileSizeKb: null,
          documentUrl: s.documentUrl ?? null,
          evidenceVaultId: s.evidenceVaultId ?? null,
          downloadPath: !s.documentUrl
            ? `/mobile/evidence-vault/documents/${docId}/download`
            : null,
          linkedRecord: docId,
          linkedRecordName: name,
          linkedRecordDocumentId,
          uploadedBy: businessName,
          uploadedDate: s.createdAt,
          linkedDocumentCreationDate: s.saleDate,
        },
        searchLower,
      );

      const receiptUrl = s.receiptUrl?.trim();
      if (receiptUrl) {
        const receiptBase = `Receipt - Sale ${s.invoiceNumber}`;
        const itemLabel =
          s.itemName != null && String(s.itemName).trim() !== ""
            ? String(s.itemName).trim()
            : null;
        const receiptName = itemLabel
          ? `${receiptBase} (${itemLabel})`
          : s.customerName
            ? `${receiptBase} - ${s.customerName}`
            : receiptBase;
        pushDoc(
          docs,
          seen,
          {
            id: `sale-receipt-${s.id}`,
            documentId: makeDocumentRef(s.id, "DOC-R"),
            name: receiptName,
            category: "Sales-Transactions",
            source: "Sales",
            date: s.saleDate,
            fileSizeKb: null,
            documentUrl: receiptUrl,
            evidenceVaultId: null,
            linkedRecord: `sale-${s.id}`,
            linkedRecordName: name,
            linkedRecordDocumentId,
            uploadedBy: businessName,
            uploadedDate: s.updatedAt,
            linkedDocumentCreationDate: s.saleDate,
          },
          searchLower,
        );
      }
    }

    for (const e of expenses) {
      if (!e.receiptUrl) continue;
      const name = `Receipt - ${e.description}`;
      const linkedRecordDocumentId = expenseLinkedRecordDocumentId(
        e.expenseNumber,
      );
      pushDoc(
        docs,
        seen,
        {
          id: `expense-${e.id}`,
          documentId: makeDocumentRef(e.id),
          name,
          category: "Expense-Transactions",
          source: "Expenses",
          date: e.expenseDate,
          fileSizeKb: null,
          documentUrl: e.receiptUrl,
          evidenceVaultId: null,
          linkedRecord: `expense-${e.id}`,
          linkedRecordName: e.description,
          linkedRecordDocumentId,
          uploadedBy: businessName,
          uploadedDate: e.createdAt,
          linkedDocumentCreationDate: e.expenseDate,
        },
        searchLower,
      );

      if (e.paymentType === "Invoice") {
        pushDoc(
          docs,
          seen,
          {
            id: `expense-purchase-${e.id}`,
            documentId: makeDocumentRef(e.id, "DOC-P"),
            name: `Purchase invoice - ${e.description}`,
            category: "Purchase-Invoices",
            source: "Expenses",
            date: e.expenseDate,
            fileSizeKb: null,
            documentUrl: e.receiptUrl,
            evidenceVaultId: null,
            linkedRecord: `expense-${e.id}`,
            linkedRecordName: e.description,
            linkedRecordDocumentId,
            uploadedBy: businessName,
            uploadedDate: e.createdAt,
            linkedDocumentCreationDate: e.expenseDate,
          },
          searchLower,
        );
      }
    }

    for (const p of payables) {
      const periodLabel = `${new Date(p.periodYear, p.periodMonth - 1).toLocaleString("default", { month: "short" })} ${p.periodYear}`;
      const linkedRecordDocumentId = taxLinkedRecordDocumentId(
        p.taxType,
        p.periodYear,
        p.periodMonth,
      );
      if (p.documentUrl || p.evidenceVaultId || p.receiptUrl) {
        if (p.receiptUrl) {
          pushDoc(
            docs,
            seen,
            {
              id: `payable-receipt-${p.id}`,
              documentId: makeDocumentRef(p.id, "DOC-R"),
              name: `Receipt - ${p.taxType} ${periodLabel}`,
              category: "Tax-Filings",
              source: "Filings",
              date: p.submittedAt || p.createdAt,
              fileSizeKb: null,
              documentUrl: p.receiptUrl,
              evidenceVaultId: p.evidenceVaultId,
              linkedRecord: `payable-${p.id}`,
              linkedRecordName: `${p.taxType} Filing ${periodLabel}`,
              linkedRecordDocumentId,
              uploadedBy: businessName,
              uploadedDate: p.submittedAt || p.createdAt,
              linkedDocumentCreationDate: p.createdAt,
            },
            searchLower,
          );
        }
        const filingName = `${p.taxType} Filing ${periodLabel}`;
        const docId = `payable-${p.id}`;
        pushDoc(
          docs,
          seen,
          {
            id: docId,
            documentId: makeDocumentRef(p.id),
            name: filingName,
            category: "Tax-Filings",
            source: "Filings",
            date: p.submittedAt || p.createdAt,
            fileSizeKb: null,
            documentUrl: p.documentUrl,
            evidenceVaultId: p.evidenceVaultId,
            downloadPath: !p.documentUrl
              ? `/mobile/evidence-vault/documents/${docId}/download`
              : null,
            linkedRecord: docId,
            linkedRecordName: filingName,
            linkedRecordDocumentId,
            uploadedBy: businessName,
            uploadedDate: p.submittedAt || p.createdAt,
            linkedDocumentCreationDate: p.createdAt,
          },
          searchLower,
        );
      }
    }

    for (const r of reports) {
      const name = `${r.reportType} - ${r.periodLabel}`;
      const docId = `report-${r.id}`;
      pushDoc(
        docs,
        seen,
        {
          id: docId,
          documentId: makeDocumentRef(r.id),
          name,
          category: "Tax-Filings",
          source: "Reports",
          date: r.generatedAt,
          fileSizeKb: null,
          documentUrl: r.documentUrl,
          evidenceVaultId: r.evidenceVaultId,
          downloadPath: !r.documentUrl
            ? `/mobile/evidence-vault/documents/${docId}/download`
            : null,
          linkedRecord: docId,
          linkedRecordName: name,
          linkedRecordDocumentId: reportLinkedRecordDocumentId(r.id),
          uploadedBy: businessName,
          uploadedDate: r.generatedAt,
          linkedDocumentCreationDate: r.generatedAt,
        },
        searchLower,
      );
    }

    for (const a of assets) {
      const urls =
        a.evidenceUrls && a.evidenceUrls.length > 0
          ? a.evidenceUrls
          : a.evidenceUrl
            ? [a.evidenceUrl]
            : [];
      const linkedRecordDocumentId = assetLinkedRecordDocumentId(a.assetCode);
      urls.forEach((url, index) => {
        const trimmed = url?.trim();
        if (!trimmed) return;
        pushDoc(
          docs,
          seen,
          {
            id: `asset-${a.id}-${index}`,
            documentId: makeDocumentRef(a.id, index === 0 ? "DOC" : `DOC-${index}`),
            name: `Asset evidence - ${a.assetName}`,
            category: "Assets",
            source: "Assets",
            date: a.purchaseDate,
            fileSizeKb: null,
            documentUrl: trimmed,
            evidenceVaultId: null,
            linkedRecord: `asset-${a.id}`,
            linkedRecordName: a.assetName,
            linkedRecordDocumentId,
            uploadedBy: businessName,
            uploadedDate: a.createdAt,
            linkedDocumentCreationDate: a.purchaseDate,
          },
          searchLower,
        );
      });
    }

    for (const d of disposals) {
      const url = d.evidenceUrl?.trim();
      if (!url) continue;
      const assetName = d.asset?.assetName ?? "Asset";
      const assetCode = d.asset?.assetCode ?? d.assetId;
      pushDoc(
        docs,
        seen,
        {
          id: `asset-disposal-${d.id}`,
          documentId: makeDocumentRef(d.id),
          name: `Disposal evidence - ${assetName}`,
          category: "Assets",
          source: "Assets",
          date: d.disposalDate,
          fileSizeKb: null,
          documentUrl: url,
          evidenceVaultId: null,
          linkedRecord: `asset-${d.assetId}`,
          linkedRecordName: assetName,
          linkedRecordDocumentId: assetLinkedRecordDocumentId(assetCode),
          uploadedBy: businessName,
          uploadedDate: d.createdAt,
          linkedDocumentCreationDate: d.disposalDate,
        },
        searchLower,
      );
    }

    for (const p of payrollRows) {
      const linkedRecordDocumentId = payrollLinkedRecordDocumentId(
        p.type,
        p.period,
      );
      const nameBase = `${p.type} ${p.period}`;
      (p.evidenceUrls ?? []).forEach((url, index) => {
        const trimmed = url?.trim();
        if (!trimmed) return;
        pushDoc(
          docs,
          seen,
          {
            id: `payroll-${p.id}-${index}`,
            documentId: makeDocumentRef(p.id, index === 0 ? "DOC" : `DOC-${index}`),
            name: `Payroll evidence - ${nameBase}`,
            category: "Payroll",
            source: "Payroll",
            date: p.dueDate,
            fileSizeKb: null,
            documentUrl: trimmed,
            evidenceVaultId: null,
            linkedRecord: `payroll-${p.id}`,
            linkedRecordName: nameBase,
            linkedRecordDocumentId,
            uploadedBy: businessName,
            uploadedDate: p.updatedAt,
            linkedDocumentCreationDate: p.createdAt,
          },
          searchLower,
        );
      });
    }

    for (const row of stored) {
      pushDoc(docs, seen, toVaultFromRow(row, businessName), searchLower);
    }

    docs.sort((a, b) => b.date.getTime() - a.date.getTime());

    let out = docs;
    if (filters?.dateFrom || filters?.dateTo) {
      const from = filters.dateFrom?.getTime();
      const to = filters.dateTo?.getTime();
      out = out.filter((d) => {
        const t = d.date.getTime();
        if (from != null && t < from) return false;
        if (to != null && t > to) return false;
        return true;
      });
    }

    if (categoryNorm !== "all") {
      out = out.filter((d) => d.category === categoryNorm);
    }
    return out;
  },

  async getCategoryCounts(userId: string): Promise<Record<string, number>> {
    const docs = await this.listDocuments(userId, {});
    const counts: Record<string, number> = { all: docs.length };
    for (const c of EVIDENCE_VAULT_CATEGORIES) counts[c] = 0;
    for (const d of docs) {
      if (counts[d.category] != null) counts[d.category]++;
    }
    return counts;
  },

  async getDocumentById(
    userId: string,
    compositeId: string,
  ): Promise<VaultDocument | null> {
    if (compositeId.startsWith("doc-")) {
      const id = compositeId.slice("doc-".length);
      const row = await prisma.evidenceVaultDocument.findFirst({
        where: { id, userId },
      });
      if (row) {
        const businessName = await resolveBusinessName(userId);
        return toVaultFromRow(row, businessName);
      }
    }
    const list = await this.listDocuments(userId, {});
    return list.find((d) => d.id === compositeId) ?? null;
  },

  async getDownloadUrl(
    userId: string,
    compositeId: string,
  ): Promise<string | null> {
    const doc = await this.getDocumentById(userId, compositeId);
    if (!doc) return null;
    return doc.documentUrl ?? null;
  },

  canGeneratePdf(compositeId: string): boolean {
    return (
      (compositeId.startsWith("sale-") &&
        !compositeId.startsWith("sale-receipt-")) ||
      (compositeId.startsWith("payable-") &&
        !compositeId.startsWith("payable-receipt-")) ||
      compositeId.startsWith("report-")
    );
  },

  async createDocument(
    userId: string,
    data: {
      url: string;
      category: string;
      linkedRecord: string;
      uploadedBy?: string;
      uploadedDate?: Date | string;
      name?: string;
      fileSizeKb?: number | null;
    },
  ): Promise<VaultDocument> {
    const categoryNorm = normalizeEvidenceVaultCategory(data.category);
    if (!categoryNorm || categoryNorm === "all") {
      throw new HttpReplyError(
        400,
        `category must be one of: ${EVIDENCE_VAULT_CATEGORIES.join(", ")}`,
      );
    }

    const url = data.url?.trim();
    if (!url) throw new HttpReplyError(400, "url is required");

    const linkedRecord = data.linkedRecord?.trim();
    if (!linkedRecord) {
      throw new HttpReplyError(400, "linkedRecord is required");
    }

    const businessName = await resolveBusinessName(userId);
    const uploadedByLabel =
      data.uploadedBy?.trim() || businessName;

    const resolved = await resolveByLinkedRecord(
      userId,
      categoryNorm,
      linkedRecord,
    );

    const allowUnresolved =
      categoryNorm === "Bank-Statement-Analysis" ||
      categoryNorm === "Ledger-Watch-Findings";

    if (!resolved && !allowUnresolved) {
      throw new HttpReplyError(
        404,
        "No matching record found for linkedRecord in this category",
      );
    }

    const sourceByCategory: Record<EvidenceVaultCategory, string> = {
      "Sales-Transactions": "Sales",
      "Purchase-Invoices": "Purchases",
      "Expense-Transactions": "Expenses",
      Assets: "Assets",
      Payroll: "Payroll",
      "Tax-Filings": "Filings",
      "Bank-Statement-Analysis": "Bank Statement Analysis",
      "Accounts-Receivable": "Accounts Receivable",
      "Accounts-Payable": "Accounts Payable",
      "Inventory-Transactions": "Inventory",
      "Ledger-Watch-Findings": "Ledger Watch",
    };

    const linked: ResolvedLink = resolved ?? {
      linkedRecord,
      linkedRecordName: data.name?.trim() || linkedRecord,
      linkedRecordDocumentId: linkedRecord,
      linkedDocumentCreationDate: new Date(),
      source: sourceByCategory[categoryNorm],
      name: data.name?.trim() || `Evidence - ${linkedRecord}`,
      date: new Date(),
    };

    const dedupeKey = buildDedupeKey(categoryNorm, linked.linkedRecord, url);

    const existing = await prisma.evidenceVaultDocument.findUnique({
      where: { userId_dedupeKey: { userId, dedupeKey } },
    });
    if (existing) {
      return toVaultFromRow(existing, businessName);
    }

    const existingList = await this.listDocuments(userId, {
      category: categoryNorm,
    });
    const dup = existingList.find(
      (d) =>
        d.linkedRecord === linked.linkedRecord &&
        (d.documentUrl ?? "").trim().toLowerCase() === url.toLowerCase(),
    );
    if (dup) return dup;

    const uploadedDate =
      data.uploadedDate != null ? new Date(data.uploadedDate) : new Date();

    const row = await prisma.evidenceVaultDocument.create({
      data: {
        userId,
        documentId: makeDocumentRef(
          `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`,
        ),
        name: data.name?.trim() || linked.name,
        category: categoryNorm,
        source: linked.source,
        date: linked.date,
        fileSizeKb: data.fileSizeKb ?? null,
        documentUrl: url,
        evidenceVaultId: null,
        linkedRecord: linked.linkedRecord,
        linkedRecordName: linked.linkedRecordName,
        linkedRecordDocumentId: linked.linkedRecordDocumentId,
        uploadedBy: uploadedByLabel,
        uploadedDate,
        linkedDocumentCreationDate: linked.linkedDocumentCreationDate,
        dedupeKey,
        origin: "MANUAL",
      },
    });

    return toVaultFromRow(row, businessName);
  },

  async listRecordsByCategory(
    userId: string,
    categoryRaw: string,
  ): Promise<VaultRecord[]> {
    const categoryNorm = normalizeEvidenceVaultCategory(categoryRaw);
    if (!categoryNorm || categoryNorm === "all") {
      throw new HttpReplyError(
        400,
        `category must be one of: ${EVIDENCE_VAULT_CATEGORIES.join(", ")}`,
      );
    }

    switch (categoryNorm) {
      case "Sales-Transactions": {
        const sales = await prisma.sale.findMany({
          where: { userId },
          orderBy: [{ saleDate: "desc" }, { createdAt: "desc" }],
        });
        return sales.map((s) => ({
          id: `sale-${s.id}`,
          name: `Invoice ${s.invoiceNumber}${s.customerName ? ` - ${s.customerName}` : ""}`,
          amount: decimalToNumber(s.totalAmount),
        }));
      }
      case "Accounts-Receivable": {
        const sales = await prisma.sale.findMany({
          where: { userId, paymentType: "Invoice" },
          orderBy: [{ saleDate: "desc" }],
        });
        return sales
          .map((s) => {
            const paid = coerceInvoiceAmountPaid(s.invoiceAmountPaid).total;
            const total = decimalToNumber(s.totalAmount);
            const outstanding = Math.max(0, total - paid);
            return {
              id: `sale-${s.id}`,
              name: `Invoice ${s.invoiceNumber}${s.customerName ? ` - ${s.customerName}` : ""}`,
              amount: outstanding,
            };
          })
          .filter((r) => r.amount > 0);
      }
      case "Expense-Transactions":
      case "Purchase-Invoices": {
        const expenses = await prisma.expense.findMany({
          where:
            categoryNorm === "Purchase-Invoices"
              ? { userId, paymentType: "Invoice" }
              : { userId },
          orderBy: [{ expenseDate: "desc" }],
        });
        return expenses.map((e) => ({
          id: `expense-${e.id}`,
          name: e.description,
          amount: decimalToNumber(e.totalAmount),
        }));
      }
      case "Accounts-Payable": {
        const expenses = await prisma.expense.findMany({
          where: { userId, paymentType: "Invoice" },
          orderBy: [{ expenseDate: "desc" }],
        });
        return expenses
          .map((e) => {
            const paid = coerceInvoiceAmountPaid(e.invoiceAmountPaid).total;
            const total = decimalToNumber(e.totalAmount);
            const outstanding = Math.max(0, total - paid);
            return {
              id: `expense-${e.id}`,
              name: e.description,
              amount: outstanding,
            };
          })
          .filter((r) => r.amount > 0);
      }
      case "Assets": {
        const assets = await prisma.asset.findMany({
          where: { userId },
          orderBy: { purchaseDate: "desc" },
        });
        return assets.map((a) => ({
          id: `asset-${a.id}`,
          name: a.assetName,
          amount: decimalToNumber(a.purchaseCost),
        }));
      }
      case "Payroll": {
        const rows = await prisma.payrollObligation.findMany({
          where: { userId },
          orderBy: { period: "desc" },
        });
        return rows.map((r) => ({
          id: `payroll-${r.id}`,
          name: `${r.type} ${r.period}`,
          amount: decimalToNumber(r.amount),
        }));
      }
      case "Tax-Filings": {
        const payables = await prisma.taxPayable.findMany({
          where: { userId },
          orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
        });
        return payables.map((p) => {
          const periodLabel = `${new Date(p.periodYear, p.periodMonth - 1).toLocaleString("default", { month: "short" })} ${p.periodYear}`;
          return {
            id: `payable-${p.id}`,
            name: `${p.taxType} Filing ${periodLabel}`,
            amount: decimalToNumber(p.totalPayable),
          };
        });
      }
      case "Inventory-Transactions": {
        const sales = await prisma.inventorySale.findMany({
          where: { userId },
          orderBy: { soldAt: "desc" },
        });
        return sales.map((s) => ({
          id: `inventory-sale-${s.id}`,
          name: s.customerName
            ? `Inventory sale - ${s.customerName}`
            : `Inventory sale ${s.id.slice(0, 8)}`,
          amount: decimalToNumber(s.totalAmount),
        }));
      }
      case "Bank-Statement-Analysis":
      case "Ledger-Watch-Findings":
        return [];
      default:
        return [];
    }
  },
};

/** Re-export for AI controller compatibility */
export const EVIDENCE_CATEGORIES = [
  "all",
  ...EVIDENCE_VAULT_CATEGORIES,
] as const;

export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];
