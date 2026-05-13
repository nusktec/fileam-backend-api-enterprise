import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

export const EVIDENCE_CATEGORIES = [
  "all",
  "invoices",
  "receipts",
  "vat_schedules",
  "filings",
  "wht_notes",
] as const;

export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

interface VaultDocument {
  id: string;
  documentId: string;
  name: string;
  category: string;
  source: string;
  date: Date;
  fileSizeKb: number | null;
  documentUrl: string | null;
  evidenceVaultId: string | null;
  /** When documentUrl is null, use this path to fetch PDF on request (requires auth) */
  downloadPath?: string | null;
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
    const searchLower = filters?.search?.toLowerCase().trim();
    const category = (filters?.category || "all").toLowerCase();

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

    const [sales, expenses, payables, reports] = await Promise.all([
      prisma.sale.findMany({
        where: saleWhere,
        orderBy: { saleDate: "desc" },
      }),
      prisma.expense.findMany({
        where: expenseWhere,
        orderBy: { expenseDate: "desc" },
      }),
      prisma.taxPayable.findMany({
        where: { userId },
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      }),
      prisma.report.findMany({
        where: reportWhere,
        orderBy: { generatedAt: "desc" },
      }),
    ]);

    for (const s of sales) {
      const name = `Invoice ${s.invoiceNumber}${s.customerName ? ` - ${s.customerName}` : ""}`;
      if (searchLower && !name.toLowerCase().includes(searchLower)) continue;
      const docId = `sale-${s.id}`;
      docs.push({
        id: docId,
        documentId: `DOC-${s.id.slice(0, 8).toUpperCase()}`,
        name,
        category: "Invoices",
        source: "Sales",
        date: s.saleDate,
        fileSizeKb: null,
        documentUrl: s.documentUrl ?? null,
        evidenceVaultId: s.evidenceVaultId ?? null,
        downloadPath: !s.documentUrl ? `/mobile/evidence-vault/documents/${docId}/download` : null,
      });

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
        if (
          searchLower &&
          !receiptName.toLowerCase().includes(searchLower) &&
          !s.description.toLowerCase().includes(searchLower)
        )
          continue;
        docs.push({
          id: `sale-receipt-${s.id}`,
          documentId: `DOC-R-${s.id.slice(0, 8).toUpperCase()}`,
          name: receiptName,
          category: "Receipts",
          source: "Sales",
          date: s.saleDate,
          fileSizeKb: null,
          documentUrl: receiptUrl,
          evidenceVaultId: null,
        });
      }
    }

    for (const e of expenses) {
      if (!e.receiptUrl) continue;
      const name = `Receipt - ${e.description}`;
      if (searchLower && !name.toLowerCase().includes(searchLower)) continue;
      docs.push({
        id: `expense-${e.id}`,
        documentId: `DOC-${e.id.slice(0, 8).toUpperCase()}`,
        name,
        category: "Receipts",
        source: "Expenses",
        date: e.expenseDate,
        fileSizeKb: null,
        documentUrl: e.receiptUrl,
        evidenceVaultId: null,
      });
    }

    for (const p of payables) {
      const periodLabel = `${new Date(p.periodYear, p.periodMonth - 1).toLocaleString("default", { month: "short" })} ${p.periodYear}`;
      if (p.documentUrl || p.evidenceVaultId || p.receiptUrl) {
        if (p.receiptUrl) {
          const name = `Receipt - ${p.taxType} ${periodLabel}`;
          if (searchLower && !name.toLowerCase().includes(searchLower))
            continue;
          docs.push({
            id: `payable-receipt-${p.id}`,
            documentId: `DOC-${p.id.slice(0, 8).toUpperCase()}`,
            name,
            category: "Receipts",
            source: "Filings",
            date: p.submittedAt || p.createdAt,
            fileSizeKb: null,
            documentUrl: p.receiptUrl,
            evidenceVaultId: p.evidenceVaultId,
          });
        }
        const filingName = `${p.taxType} Filing ${periodLabel}`;
        const cat =
          p.taxType === "VAT"
            ? "VAT Schedules"
            : p.taxType === "WHT"
              ? "WHT Notes"
              : "Filings";
        if (searchLower && !filingName.toLowerCase().includes(searchLower))
          continue;
        const docId = `payable-${p.id}`;
        docs.push({
          id: docId,
          documentId: `DOC-${p.id.slice(0, 8).toUpperCase()}`,
          name: filingName,
          category: cat,
          source: "Filings",
          date: p.submittedAt || p.createdAt,
          fileSizeKb: null,
          documentUrl: p.documentUrl,
          evidenceVaultId: p.evidenceVaultId,
          downloadPath: !p.documentUrl ? `/mobile/evidence-vault/documents/${docId}/download` : null,
        });
      }
    }

    for (const r of reports) {
      const name = `${r.reportType} - ${r.periodLabel}`;
      if (searchLower && !name.toLowerCase().includes(searchLower)) continue;
      const docId = `report-${r.id}`;
      docs.push({
        id: docId,
        documentId: `DOC-${r.id.slice(0, 8).toUpperCase()}`,
        name,
        category: "Filings",
        source: "Reports",
        date: r.generatedAt,
        fileSizeKb: null,
        documentUrl: r.documentUrl,
        evidenceVaultId: r.evidenceVaultId,
        downloadPath: !r.documentUrl ? `/mobile/evidence-vault/documents/${docId}/download` : null,
      });
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

    if (category && category !== "all") {
      const categoryMap: Record<string, string> = {
        invoices: "Invoices",
        receipts: "Receipts",
        vat_schedules: "VAT Schedules",
        wht_notes: "WHT Notes",
        filings: "Filings",
      };
      const target = categoryMap[category];
      if (target) return out.filter((d) => d.category === target);
    }
    return out;
  },

  async getCategoryCounts(userId: string): Promise<Record<string, number>> {
    const docs = await this.listDocuments(userId, {});
    const counts: Record<string, number> = {
      all: docs.length,
      Invoices: 0,
      Receipts: 0,
      "VAT Schedules": 0,
      "WHT Notes": 0,
      Filings: 0,
    };
    for (const d of docs) {
      if (counts[d.category] != null) counts[d.category]++;
    }
    return counts;
  },

  async getDocumentById(
    userId: string,
    compositeId: string,
  ): Promise<VaultDocument | null> {
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
};
