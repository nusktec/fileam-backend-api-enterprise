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
}

export const evidenceVaultService = {
  async listDocuments(
    userId: string,
    filters?: { search?: string; category?: string }
  ): Promise<VaultDocument[]> {
    const docs: VaultDocument[] = [];
    const searchLower = filters?.search?.toLowerCase().trim();
    const category = (filters?.category || "all").toLowerCase();

    const [sales, expenses, payables, reports] = await Promise.all([
      prisma.sale.findMany({
        where: { userId },
        orderBy: { saleDate: "desc" },
      }),
      prisma.expense.findMany({
        where: { userId },
        orderBy: { expenseDate: "desc" },
      }),
      prisma.taxPayable.findMany({
        where: { userId },
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      }),
      prisma.report.findMany({
        where: { userId },
        orderBy: { generatedAt: "desc" },
      }),
    ]);

    for (const s of sales) {
      const name = `Invoice ${s.invoiceNumber}${s.customerName ? ` - ${s.customerName}` : ""}`;
      if (searchLower && !name.toLowerCase().includes(searchLower)) continue;
      docs.push({
        id: `sale-${s.id}`,
        documentId: `DOC-${s.id.slice(0, 8).toUpperCase()}`,
        name,
        category: "Invoices",
        source: "Sales",
        date: s.saleDate,
        fileSizeKb: null,
        documentUrl: null,
        evidenceVaultId: null,
      });
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
          if (searchLower && !name.toLowerCase().includes(searchLower)) continue;
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
        const cat = p.taxType === "VAT" ? "VAT Schedules" : p.taxType === "WHT" ? "WHT Notes" : "Filings";
        if (searchLower && !filingName.toLowerCase().includes(searchLower)) continue;
        docs.push({
          id: `payable-${p.id}`,
          documentId: `DOC-${p.id.slice(0, 8).toUpperCase()}`,
          name: filingName,
          category: cat,
          source: "Filings",
          date: p.submittedAt || p.createdAt,
          fileSizeKb: null,
          documentUrl: p.documentUrl,
          evidenceVaultId: p.evidenceVaultId,
        });
      }
    }

    for (const r of reports) {
      const name = `${r.reportType} - ${r.periodLabel}`;
      if (searchLower && !name.toLowerCase().includes(searchLower)) continue;
      docs.push({
        id: `report-${r.id}`,
        documentId: `DOC-${r.id.slice(0, 8).toUpperCase()}`,
        name,
        category: "Filings",
        source: "Reports",
        date: r.generatedAt,
        fileSizeKb: null,
        documentUrl: r.documentUrl,
        evidenceVaultId: r.evidenceVaultId,
      });
    }

    docs.sort((a, b) => b.date.getTime() - a.date.getTime());
    if (category && category !== "all") {
      const categoryMap: Record<string, string> = {
        invoices: "Invoices",
        receipts: "Receipts",
        vat_schedules: "VAT Schedules",
        wht_notes: "WHT Notes",
        filings: "Filings",
      };
      const target = categoryMap[category];
      if (target) return docs.filter((d) => d.category === target);
    }
    return docs;
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

  async getDocumentById(userId: string, compositeId: string): Promise<VaultDocument | null> {
    const list = await this.listDocuments(userId, {});
    return list.find((d) => d.id === compositeId) ?? null;
  },

  async getDownloadUrl(userId: string, compositeId: string): Promise<string | null> {
    const doc = await this.getDocumentById(userId, compositeId);
    if (!doc || !doc.documentUrl) return null;
    return doc.documentUrl;
  },
};
