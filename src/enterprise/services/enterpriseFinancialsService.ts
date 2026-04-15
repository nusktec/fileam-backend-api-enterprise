import { prisma } from "../../config/database";
import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import {
  BALANCE_SHEET_MOCK_CURRENT_ASSETS_OF_INCOME,
  BALANCE_SHEET_MOCK_FIXED_ASSETS_OF_INCOME,
  BALANCE_SHEET_MOCK_LIABILITIES_OF_EXPENSE,
  BALANCE_SHEET_MOCK_TOTAL_ASSETS_OF_INCOME,
  CIT_INDUSTRY_EXCEPTION_CATEGORIES,
  KPI_PERCENT_ROUNDING_FACTOR,
  PERCENT,
  VAT_RATE_PERCENT,
} from "../../constants/percentages";
import type { FinancialDocumentUploadInput } from "../../interfaces/enterprise/financials";

const DOCUMENT_TYPES = [
  "Invoice",
  "Receipt",
  "Bank Statement",
  "Tax Document",
  "Contract",
  "Other",
];
const CURRENCIES = ["USD", "NGN", "GBP", "EUR"];

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

export type ProfitAndLossQueryOpts = {
  year?: number;
  month?: number;
  /** `thisMonth` | `thisYear` or custom via dateFrom/dateTo */
  preset?: string;
  dateFrom?: string;
  dateTo?: string;
};

function resolvePlDateRange(opts: ProfitAndLossQueryOpts): {
  start: Date;
  end: Date;
  presetLabel: string;
} {
  const now = new Date();
  const yNow = now.getFullYear();
  const mNow = now.getMonth();

  if (opts.dateFrom && opts.dateTo) {
    const start = new Date(opts.dateFrom);
    const end = new Date(opts.dateTo);
    end.setHours(23, 59, 59, 999);
    return { start, end, presetLabel: "custom" };
  }

  const p = (opts.preset || "").toLowerCase();
  if (p === "thismonth") {
    const start = new Date(yNow, mNow, 1);
    const end = new Date(yNow, mNow + 1, 0, 23, 59, 59, 999);
    return { start, end, presetLabel: "thisMonth" };
  }
  if (p === "thisyear") {
    const start = new Date(yNow, 0, 1);
    const endOfYear = new Date(yNow, 11, 31, 23, 59, 59, 999);
    const end = now < endOfYear ? now : endOfYear;
    end.setHours(23, 59, 59, 999);
    return { start, end, presetLabel: "thisYear" };
  }

  if (opts.year != null && opts.month != null) {
    const start = new Date(opts.year, opts.month - 1, 1);
    const end = new Date(opts.year, opts.month, 0, 23, 59, 59, 999);
    return {
      start,
      end,
      presetLabel: `month:${opts.year}-${opts.month}`,
    };
  }

  if (opts.year != null) {
    return {
      start: new Date(opts.year, 0, 1),
      end: new Date(opts.year, 11, 31, 23, 59, 59, 999),
      presetLabel: `year:${opts.year}`,
    };
  }

  return {
    start: new Date(yNow, 0, 1),
    end: new Date(yNow, 11, 31, 23, 59, 59, 999),
    presetLabel: `year:${yNow}`,
  };
}

async function getEnterprisePlBreakdown(
  companyId: string,
  start: Date,
  end: Date,
) {
  const txs = await prisma.enterpriseTransaction.findMany({
    where: {
      companyId,
      date: { gte: start, lte: end },
    },
  });
  let revenueTotal = 0;
  let expenseTotal = 0;
  const revenueByCategory: Record<string, number> = {};
  const expensesByCategory: Record<string, number> = {};
  const byMonthKey = new Map<
    string,
    { revenue: number; expenses: number; net: number }
  >();

  for (const t of txs) {
    const amt = Math.abs(decimalToNumber(t.amount));
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const isIncome = t.type === "income" || t.status === "Received";
    if (isIncome) {
      revenueTotal += amt;
      revenueByCategory["Income"] = (revenueByCategory["Income"] ?? 0) + amt;
    } else {
      expenseTotal += amt;
      expensesByCategory["Expenses"] =
        (expensesByCategory["Expenses"] ?? 0) + amt;
    }
    const row = byMonthKey.get(key) ?? { revenue: 0, expenses: 0, net: 0 };
    if (isIncome) row.revenue += amt;
    else row.expenses += amt;
    row.net = row.revenue - row.expenses;
    byMonthKey.set(key, row);
  }

  const netProfit = revenueTotal - expenseTotal;
  const profitMarginPercent =
    revenueTotal > 0
      ? Math.round(
          (netProfit / revenueTotal) *
            PERCENT *
            KPI_PERCENT_ROUNDING_FACTOR,
        ) / KPI_PERCENT_ROUNDING_FACTOR
      : 0;

  const monthlyBreakdown = [...byMonthKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, v]) => ({
      period,
      revenue: v.revenue,
      expenses: v.expenses,
      netProfit: v.net,
    }));

  return {
    revenueTotal,
    expenseTotal,
    netProfit,
    profitMarginPercent,
    revenueByCategory,
    expensesByCategory,
    monthlyBreakdown,
    recordCounts: { sales: 0, expenses: 0, transactions: txs.length },
    formulas: {
      netProfit:
        "sum(income-class amounts) − sum(expense-class amounts) from enterprise_transactions in range",
      profitMarginPercent:
        "round((netProfit ÷ revenueTotal) × 100, 1 decimal) or 0 if revenue is 0",
      citNote:
        CIT_INDUSTRY_EXCEPTION_CATEGORIES.length === 0
          ? "CIT is modeled annually from profit; industry exception categories are empty — extend CIT_INDUSTRY_EXCEPTION_CATEGORIES when needed."
          : `Categories ${CIT_INDUSTRY_EXCEPTION_CATEGORIES.join(", ")} may require non-annual CIT handling.`,
    },
  };
}

/** One financial document may link to at most one invoice per company; clears any previous invoice using the same file. */
async function linkInvoiceFinancialDocumentInTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  invoiceId: string,
  financialDocumentId: string | null,
) {
  if (financialDocumentId == null) {
    await tx.enterpriseInvoice.update({
      where: { id: invoiceId },
      data: { financialDocumentId: null },
    });
    return;
  }
  const doc = await tx.enterpriseFinancialDocument.findFirst({
    where: { id: financialDocumentId, companyId },
  });
  if (!doc) {
    throw new Error("Financial document not found for this company");
  }
  const other = await tx.enterpriseInvoice.findFirst({
    where: { financialDocumentId, id: { not: invoiceId } },
  });
  if (other) {
    await tx.enterpriseInvoice.update({
      where: { id: other.id },
      data: { financialDocumentId: null },
    });
  }
  await tx.enterpriseInvoice.update({
    where: { id: invoiceId },
    data: { financialDocumentId },
  });
}

/** Row shape from Prisma (include or explicit select); documentId is evidence-vault link, else null. */
type EnterpriseInvoiceWithLineItems = {
  id: string;
  companyId: string;
  invoiceNumber: string;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  dateIssued: Date;
  dueDate: Date;
  paymentStatus: string;
  totalAmount: Decimal;
  notes: string | null;
  documentId: string | null;
  financialDocumentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lineItems: Array<{
    id: string;
    invoiceId: string;
    description: string;
    quantity: number;
    unitPrice: Decimal;
    total: Decimal;
    sortOrder: number;
    createdAt: Date;
  }>;
};

/** Plain JSON shape for API responses (always includes documentId, null when not linked). */
function serializeEnterpriseInvoice(inv: EnterpriseInvoiceWithLineItems) {
  const lineItems = [...inv.lineItems].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  return {
    id: inv.id,
    companyId: inv.companyId,
    invoiceNumber: inv.invoiceNumber,
    clientName: inv.clientName,
    clientAddress: inv.clientAddress,
    clientEmail: inv.clientEmail,
    dateIssued: inv.dateIssued,
    dueDate: inv.dueDate,
    paymentStatus: inv.paymentStatus,
    totalAmount: decimalToNumber(inv.totalAmount),
    notes: inv.notes,
    documentId: inv.documentId == null ? null : inv.documentId,
    financialDocumentId:
      inv.financialDocumentId == null ? null : inv.financialDocumentId,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
    lineItems: lineItems.map((l) => ({
      id: l.id,
      invoiceId: l.invoiceId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: decimalToNumber(l.unitPrice),
      total: decimalToNumber(l.total),
      sortOrder: l.sortOrder,
      createdAt: l.createdAt,
    })),
  };
}

const enterpriseInvoiceListSelect = {
  id: true,
  companyId: true,
  invoiceNumber: true,
  clientName: true,
  clientAddress: true,
  clientEmail: true,
  dateIssued: true,
  dueDate: true,
  paymentStatus: true,
  totalAmount: true,
  notes: true,
  documentId: true,
  financialDocumentId: true,
  createdAt: true,
  updatedAt: true,
  lineItems: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      invoiceId: true,
      description: true,
      quantity: true,
      unitPrice: true,
      total: true,
      sortOrder: true,
      createdAt: true,
    },
  },
} satisfies Prisma.EnterpriseInvoiceSelect;

export const enterpriseFinancialsService = {
  getDocumentTypes: () => DOCUMENT_TYPES,
  getCurrencies: () => CURRENCIES,

  async getRecentTransactions(
    companyId: string,
    limit = 10,
    linkedUserId?: string,
  ) {
    if (linkedUserId) {
      const { getClientTransactions } = await import("./clientDataHelper");
      const { data } = await getClientTransactions(linkedUserId, {
        limit,
        page: 1,
        sortOrder: "desc",
      });
      return data;
    }
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const list = await prisma.enterpriseTransaction.findMany({
      where: { companyId },
      orderBy: { date: "desc" },
      take: limit,
    });
    return list.map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: decimalToNumber(t.amount),
      status: t.status,
      type: t.type,
    }));
  },

  async getAllTransactions(
    companyId: string,
    opts?: {
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: "ASC" | "DESC";
      dateFrom?: Date;
      dateTo?: Date;
    },
    linkedUserId?: string,
  ) {
    if (linkedUserId) {
      const { getClientTransactions } = await import("./clientDataHelper");
      return getClientTransactions(linkedUserId, {
        limit: opts?.limit,
        page: opts?.page,
        sortOrder: opts?.sortOrder === "ASC" ? "asc" : "desc",
        dateFrom: opts?.dateFrom,
        dateTo: opts?.dateTo,
      });
    }
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 10), 100);
    const order = opts?.sortOrder === "ASC" ? "asc" : "desc";
    const txWhere: {
      companyId: string;
      date?: { gte?: Date; lte?: Date };
    } = { companyId };
    if (opts?.dateFrom || opts?.dateTo) {
      txWhere.date = {};
      if (opts.dateFrom) txWhere.date.gte = opts.dateFrom;
      if (opts.dateTo) txWhere.date.lte = opts.dateTo;
    }
    const [list, total] = await Promise.all([
      prisma.enterpriseTransaction.findMany({
        where: txWhere,
        orderBy: { date: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.enterpriseTransaction.count({ where: txWhere }),
    ]);
    return {
      data: list.map((t) => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: decimalToNumber(t.amount),
        status: t.status,
        type: t.type,
      })),
      total,
      page,
      limit,
    };
  },

  async getSummary(companyId: string, linkedUserId?: string) {
    if (linkedUserId) {
      const { getClientFinancialSummary } = await import("./clientDataHelper");
      return getClientFinancialSummary(linkedUserId);
    }
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const transactions = await prisma.enterpriseTransaction.findMany({
      where: { companyId },
    });
    let totalIncome = 0;
    let totalExpenses = 0;
    for (const t of transactions) {
      const amt = decimalToNumber(t.amount);
      if (t.type === "income" || t.status === "Received") totalIncome += amt;
      else totalExpenses += Math.abs(amt);
    }
    return {
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
    };
  },

  async getProfitTrend(companyId: string, year?: number, linkedUserId?: string) {
    return this.getMonthlyCashFlow(companyId, year, linkedUserId);
  },

  async getExpenseBreakdown(
    companyId: string,
    year?: number,
    linkedUserId?: string,
  ) {
    if (linkedUserId) {
      const { getClientExpenseBreakdown } = await import("./clientDataHelper");
      return getClientExpenseBreakdown(linkedUserId, year);
    }
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const y = year ?? new Date().getFullYear();
    const transactions = await prisma.enterpriseTransaction.findMany({
      where: {
        companyId,
        type: "expense",
        date: {
          gte: new Date(y, 0, 1),
          lte: new Date(y, 11, 31),
        },
      },
    });
    const byCategory: Record<string, number> = {};
    for (const t of transactions) {
      byCategory["Expenses"] = (byCategory["Expenses"] ?? 0) + decimalToNumber(t.amount);
    }
    return Object.entries(byCategory).map(([category, total]) => ({
      category,
      total,
    }));
  },

  async getProfitAndLoss(
    companyId: string,
    linkedUserId: string | undefined,
    opts: ProfitAndLossQueryOpts = {},
  ) {
    const { start, end, presetLabel } = resolvePlDateRange(opts);
    const y = start.getFullYear();

    if (linkedUserId) {
      const {
        getClientPlBreakdown,
        getClientAttachmentGaps,
      } = await import("./clientDataHelper");
      const pl = await getClientPlBreakdown(linkedUserId, { start, end });
      const gaps = await getClientAttachmentGaps(linkedUserId, { start, end });
      return {
        preset: presetLabel,
        period: {
          year: y,
          month: opts.month,
          rangeStart: pl.range.start,
          rangeEnd: pl.range.end,
        },
        revenue: pl.revenueTotal,
        expenses: pl.expenseTotal,
        netProfit: pl.netProfit,
        profitMarginPercent: pl.profitMarginPercent,
        revenueByCategory: pl.revenueByCategory,
        expensesByCategory: pl.expensesByCategory,
        monthlyBreakdown: pl.monthlyBreakdown,
        formulas: pl.formulas,
        recordCounts: pl.recordCounts,
        attachmentGaps: gaps,
        citNote:
          CIT_INDUSTRY_EXCEPTION_CATEGORIES.length === 0
            ? "CIT is modeled annually from profit; add categories to CIT_INDUSTRY_EXCEPTION_CATEGORIES for industry-specific rules."
            : `Industry categories flagged for non-default CIT: ${CIT_INDUSTRY_EXCEPTION_CATEGORIES.join(", ")}`,
      };
    }

    const ent = await getEnterprisePlBreakdown(companyId, start, end);
    return {
      preset: presetLabel,
      period: {
        year: y,
        month: opts.month,
        rangeStart: start.toISOString(),
        rangeEnd: end.toISOString(),
      },
      revenue: ent.revenueTotal,
      expenses: ent.expenseTotal,
      netProfit: ent.netProfit,
      profitMarginPercent: ent.profitMarginPercent,
      revenueByCategory: ent.revenueByCategory,
      expensesByCategory: ent.expensesByCategory,
      monthlyBreakdown: ent.monthlyBreakdown,
      formulas: ent.formulas,
      recordCounts: ent.recordCounts,
      attachmentGaps: {
        salesWithoutInvoiceOrVaultAttachment: null,
        expensesWithoutReceipt: null,
        note: "Attachment gaps require a linked mobile client (sales/expense records).",
      },
      citNote: ent.formulas.citNote,
    };
  },

  async getBalanceSheet(
    companyId: string,
    year?: number,
    month?: number,
    linkedUserId?: string,
  ) {
    const summary = linkedUserId
      ? await (await import("./clientDataHelper")).getClientFinancialSummary(linkedUserId)
      : await this.getSummary(companyId);
    if (!summary) return null;
    const y = year ?? new Date().getFullYear();
    return {
      period: { year: y, month: month ?? undefined },
      assets: {
        currentAssets:
          summary.totalIncome * BALANCE_SHEET_MOCK_CURRENT_ASSETS_OF_INCOME,
        fixedAssets:
          summary.totalIncome * BALANCE_SHEET_MOCK_FIXED_ASSETS_OF_INCOME,
        total: summary.totalIncome * BALANCE_SHEET_MOCK_TOTAL_ASSETS_OF_INCOME,
      },
      liabilities: {
        currentLiabilities:
          summary.totalExpenses * BALANCE_SHEET_MOCK_LIABILITIES_OF_EXPENSE,
        longTermLiabilities: 0,
        total: summary.totalExpenses * BALANCE_SHEET_MOCK_LIABILITIES_OF_EXPENSE,
      },
      equity: summary.netProfit,
    };
  },

  async getMonthlyCashFlow(companyId: string, year?: number, linkedUserId?: string) {
    const y = year ?? new Date().getFullYear();
    if (linkedUserId) {
      const { getClientMonthlyCashFlow } = await import("./clientDataHelper");
      return getClientMonthlyCashFlow(linkedUserId, y);
    }
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const transactions = await prisma.enterpriseTransaction.findMany({
      where: { companyId },
    });
    const byMonth: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) byMonth[m] = 0;
    for (const t of transactions) {
      const d = new Date(t.date);
      if (d.getFullYear() !== y) continue;
      const amt = decimalToNumber(t.amount);
      if (t.type === "income" || t.status === "Received")
        byMonth[d.getMonth() + 1] += amt;
      else byMonth[d.getMonth() + 1] -= Math.abs(amt);
    }
    return Object.entries(byMonth).map(([month, value]) => ({
      month: Number(month),
      year: y,
      value,
    }));
  },

  async addTransaction(
    companyId: string,
    data: {
      date: Date;
      description: string;
      amount: number;
      status: string;
      type: string;
      category?: string;
      supplierName?: string;
      supplierId?: string;
      customerName?: string;
      customerId?: string;
    },
    linkedUserId?: string,
    createdById?: string,
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;

    if (linkedUserId) {
      const { salesService } = await import("../../mobile/services/salesService");
      const { expensesService } = await import("../../mobile/services/expensesService");
      const dateStr = data.date.toISOString().split("T")[0];
      const type = (data.type || "expense").toLowerCase();
      if (type === "income") {
        const sale = await salesService.create(linkedUserId, {
          amount: data.amount,
          description: data.description,
          paymentType: "Cash",
          date: dateStr,
          vatableIncome: false,
          serviceIncome: true,
          createdById: createdById ?? linkedUserId,
          customerName: data.customerName?.trim() || undefined,
          customerId: data.customerId?.trim() || undefined,
        });
        return sale
          ? {
              id: sale.id,
              date: sale.date,
              description: sale.description,
              amount: sale.totalAmount,
              status: sale.status,
              type: "income",
            }
          : null;
      }
      const expense = await expensesService.create(linkedUserId, {
        amount: data.amount,
        description: data.description,
        category: data.category || "Other",
        date: dateStr,
        vatInclusive: false,
        createdById: createdById ?? linkedUserId,
        supplierName: data.supplierName?.trim() || undefined,
        supplierId: data.supplierId?.trim() || undefined,
      });
      return expense
        ? {
            id: expense.id,
            date: expense.date,
            description: expense.description,
            amount: expense.amount,
            status: "Recorded",
            type: "expense",
          }
        : null;
    }

    return prisma.enterpriseTransaction.create({
      data: {
        companyId,
        date: data.date,
        description: data.description,
        amount: new Decimal(data.amount),
        status: data.status,
        type: data.type,
      },
    });
  },

  async deleteDocument(companyId: string, documentId: string) {
    const doc = await prisma.enterpriseFinancialDocument.findFirst({
      where: { id: documentId, companyId },
    });
    if (!doc) return null;
    await prisma.enterpriseFinancialDocument.delete({
      where: { id: documentId },
    });
    return { deleted: true };
  },

  async uploadDocument(companyId: string, data: FinancialDocumentUploadInput) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const doc = await prisma.enterpriseFinancialDocument.create({
      data: {
        companyId,
        documentType: data.documentType,
        description: data.description ?? null,
        documentDate: data.documentDate,
        amount: new Decimal(data.amount),
        currency: data.currency,
        fileUrl: data.fileUrl ?? null,
        processingStatus: "pending",
      },
    });
    const linkInvoiceId = data.invoiceId;
    if (linkInvoiceId) {
      await prisma.$transaction(async (tx) => {
        const inv = await tx.enterpriseInvoice.findFirst({
          where: { id: linkInvoiceId, companyId },
        });
        if (!inv) {
          throw new Error("Invoice not found for this company");
        }
        await linkInvoiceFinancialDocumentInTx(
          tx,
          companyId,
          linkInvoiceId,
          doc.id,
        );
      });
    }
    return doc;
  },

  async uploadInvoiceDocument(
    companyId: string,
    data: { fileUrl: string; documentDate?: Date; invoiceId?: string },
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const doc = await prisma.enterpriseFinancialDocument.create({
      data: {
        companyId,
        documentType: "Invoice",
        documentDate: data.documentDate ?? new Date(),
        amount: new Decimal(0),
        currency: "NGN",
        fileUrl: data.fileUrl,
        processingStatus: "pending",
      },
    });
    const linkInvoiceId = data.invoiceId;
    if (linkInvoiceId) {
      await prisma.$transaction(async (tx) => {
        const inv = await tx.enterpriseInvoice.findFirst({
          where: { id: linkInvoiceId, companyId },
        });
        if (!inv) {
          throw new Error("Invoice not found for this company");
        }
        await linkInvoiceFinancialDocumentInTx(
          tx,
          companyId,
          linkInvoiceId,
          doc.id,
        );
      });
    }
    return { fileId: doc.id };
  },

  async mockOcrExtract(companyId: string, fileId: string) {
    const doc = await prisma.enterpriseFinancialDocument.findFirst({
      where: { id: fileId, companyId },
    });
    if (!doc) return null;
    const extractionId = `ext-${fileId}-${Date.now()}`;
    return { extractionId };
  },

  async mockVendorIdentify(companyId: string, extractionId: string) {
    const vendorId = `vendor-${extractionId}-${Date.now()}`;
    return { vendorId };
  },

  async mockAnalyze(companyId: string, vendorId: string) {
    return { valid: true, message: "Invoice validated successfully (mock)" };
  },

  async getDocumentReview(companyId: string, documentId: string) {
    const doc = await prisma.enterpriseFinancialDocument.findFirst({
      where: { id: documentId, companyId },
    });
    if (!doc) return null;
    return {
      metrics: {
        uploadSource: "Manual",
        uploadDate: doc.createdAt,
        processingMethod: "OCR",
        manualEdit: "none",
      },
      invoiceData: {
        invoiceNumber: doc.invoiceNumber ?? "N/A",
        invoiceDate: doc.documentDate,
        vendorName: doc.vendor ?? "Unknown",
        vendorTin: null,
        subtotalExclVat: doc.subTotalExclVat ? decimalToNumber(doc.subTotalExclVat) : decimalToNumber(doc.amount),
        vatAmount: doc.vatCalculated ? decimalToNumber(doc.vatCalculated) : 0,
        vatRate: `${VAT_RATE_PERCENT}%`,
      },
      impactSummary: {
        eligibleAmount: decimalToNumber(doc.amount),
        totalExpense: decimalToNumber(doc.amount),
      },
    };
  },

  async getDocumentStatus(companyId: string, documentId: string) {
    const doc = await prisma.enterpriseFinancialDocument.findFirst({
      where: { id: documentId, companyId },
    });
    return doc
      ? {
          documentName: doc.description || doc.documentType,
          status: doc.processingStatus,
        }
      : null;
  },

  async getFinancialDocumentStats(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const docs = await prisma.enterpriseFinancialDocument.findMany({
      where: { companyId },
      select: { documentStatus: true, processingStatus: true },
    });
    let clean = 0;
    let review = 0;
    let flagged = 0;
    for (const d of docs) {
      const status = (d.documentStatus ?? d.processingStatus ?? "").toLowerCase();
      if (status === "clean" || status === "processed") clean++;
      else if (status === "review" || status === "pending") review++;
      else if (status === "flagged") flagged++;
      else review++;
    }
    return {
      total: docs.length,
      clean,
      review,
      flagged,
    };
  },

  async listFinancialDocuments(
    companyId: string,
    opts?: {
      page?: number;
      limit?: number;
      sortOrder?: "ASC" | "DESC";
      documentStatus?: string;
      dateFrom?: Date;
      dateTo?: Date;
    },
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
    const order = opts?.sortOrder === "ASC" ? "asc" : "desc";
    const where: {
      companyId: string;
      documentStatus?: string;
      documentDate?: { gte?: Date; lte?: Date };
    } = { companyId };
    if (opts?.documentStatus) where.documentStatus = opts.documentStatus;
    if (opts?.dateFrom || opts?.dateTo) {
      where.documentDate = {};
      if (opts.dateFrom) where.documentDate.gte = opts.dateFrom;
      if (opts.dateTo) where.documentDate.lte = opts.dateTo;
    }
    const [list, total] = await Promise.all([
      prisma.enterpriseFinancialDocument.findMany({
        where,
        orderBy: { documentDate: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.enterpriseFinancialDocument.count({ where }),
    ]);
    const docIds = list.map((d) => d.id);
    const invoiceLinks =
      docIds.length === 0
        ? []
        : await prisma.enterpriseInvoice.findMany({
            where: { companyId, financialDocumentId: { in: docIds } },
            select: { id: true, financialDocumentId: true },
          });
    const financialDocToInvoiceId = new Map(
      invoiceLinks.map((r) => [r.financialDocumentId!, r.id]),
    );
    return {
      data: list.map((d) => ({
        id: d.id,
        documentId: d.id,
        documentType: d.documentType,
        description: d.description,
        documentDate: d.documentDate,
        amount: decimalToNumber(d.amount),
        currency: d.currency,
        vendor: d.vendor ?? null,
        invoiceNumber: d.invoiceNumber ?? null,
        format: d.format ?? null,
        confidence: d.confidence ?? null,
        documentStatus: d.documentStatus ?? d.processingStatus,
        subTotalExclVat: d.subTotalExclVat ? decimalToNumber(d.subTotalExclVat) : null,
        totalWithVat: d.totalWithVat ? decimalToNumber(d.totalWithVat) : null,
        vatCalculated: d.vatCalculated ? decimalToNumber(d.vatCalculated) : null,
        invoiceId: financialDocToInvoiceId.get(d.id) ?? null,
      })),
      total,
      page,
      limit,
    };
  },

  async getFinancialDocument(companyId: string, documentId: string) {
    const doc = await prisma.enterpriseFinancialDocument.findFirst({
      where: { id: documentId, companyId },
    });
    if (!doc) return null;
    const linkedInvoice = await prisma.enterpriseInvoice.findFirst({
      where: { companyId, financialDocumentId: doc.id },
      select: { id: true },
    });
    return {
      id: doc.id,
      documentType: doc.documentType,
      description: doc.description,
      documentDate: doc.documentDate,
      amount: decimalToNumber(doc.amount),
      currency: doc.currency,
      fileUrl: doc.fileUrl,
      processingStatus: doc.processingStatus,
      vendor: doc.vendor ?? null,
      invoiceNumber: doc.invoiceNumber ?? null,
      format: doc.format ?? null,
      confidence: doc.confidence ?? null,
      documentStatus: doc.documentStatus ?? null,
      subTotalExclVat: doc.subTotalExclVat ? decimalToNumber(doc.subTotalExclVat) : null,
      totalWithVat: doc.totalWithVat ? decimalToNumber(doc.totalWithVat) : null,
      vatCalculated: doc.vatCalculated ? decimalToNumber(doc.vatCalculated) : null,
      invoiceId: linkedInvoice?.id ?? null,
    };
  },

  async getProcessingQueue(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const list = await prisma.enterpriseFinancialDocument.findMany({
      where: { companyId, processingStatus: "pending" },
      orderBy: { createdAt: "desc" },
    });
    return list.map((d) => ({
      id: d.id,
      documentType: d.documentType,
      documentDate: d.documentDate,
      status: d.processingStatus,
    }));
  },

  async getInvoice(companyId: string, invoiceId: string) {
    const invoice = await prisma.enterpriseInvoice.findFirst({
      where: { id: invoiceId, companyId },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
    if (!invoice) return null;
    return serializeEnterpriseInvoice(invoice);
  },

  async updateInvoice(
    companyId: string,
    invoiceId: string,
    data: {
      clientName?: string;
      clientAddress?: string;
      clientEmail?: string;
      dateIssued?: Date;
      dueDate?: Date;
      notes?: string;
      /** Set to a financial document id, or null to unlink. Omit to leave unchanged. */
      financialDocumentId?: string | null;
      lineItems?: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        total: number;
      }>;
    },
  ) {
    const invoice = await prisma.enterpriseInvoice.findFirst({
      where: { id: invoiceId, companyId },
      include: { lineItems: true },
    });
    if (!invoice) return null;
    const updateData: Record<string, unknown> = {};
    if (data.clientName != null) updateData.clientName = data.clientName;
    if (data.clientAddress != null)
      updateData.clientAddress = data.clientAddress;
    if (data.clientEmail != null) updateData.clientEmail = data.clientEmail;
    if (data.dateIssued != null) updateData.dateIssued = data.dateIssued;
    if (data.dueDate != null) updateData.dueDate = data.dueDate;
    if (data.notes != null) updateData.notes = data.notes;
    if (Object.keys(updateData).length > 0) {
      await prisma.enterpriseInvoice.update({
        where: { id: invoiceId },
        data: updateData as never,
      });
    }
    if (data.lineItems && data.lineItems.length > 0) {
      await prisma.enterpriseInvoiceLineItem.deleteMany({
        where: { invoiceId },
      });
      let totalAmount = 0;
      for (let i = 0; i < data.lineItems.length; i++) {
        const item = data.lineItems[i];
        totalAmount += item.total;
        await prisma.enterpriseInvoiceLineItem.create({
          data: {
            invoiceId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: new Decimal(item.unitPrice),
            total: new Decimal(item.total),
            sortOrder: i,
          },
        });
      }
      await prisma.enterpriseInvoice.update({
        where: { id: invoiceId },
        data: { totalAmount: new Decimal(totalAmount) },
      });
    }
    const financialDocLink = data.financialDocumentId;
    if (financialDocLink !== undefined) {
      await prisma.$transaction(async (tx) => {
        await linkInvoiceFinancialDocumentInTx(
          tx,
          companyId,
          invoiceId,
          financialDocLink ?? null,
        );
      });
    }
    const updated = await prisma.enterpriseInvoice.findUnique({
      where: { id: invoiceId },
      include: { lineItems: true },
    });
    return updated ? serializeEnterpriseInvoice(updated) : null;
  },

  async markInvoicePaid(companyId: string, invoiceId: string) {
    const invoice = await prisma.enterpriseInvoice.findFirst({
      where: { id: invoiceId, companyId },
    });
    if (!invoice) return null;
    await prisma.enterpriseInvoice.update({
      where: { id: invoiceId },
      data: { paymentStatus: "Paid" },
    });
    const full = await prisma.enterpriseInvoice.findUnique({
      where: { id: invoiceId },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
    return full ? serializeEnterpriseInvoice(full) : null;
  },

  async createInvoice(
    companyId: string,
    data: {
      clientName: string;
      clientAddress: string;
      clientEmail: string;
      dateIssued: Date;
      dueDate: Date;
      totalAmount: number;
      notes?: string;
      /** Optional structured financial document (upload pipeline) linked to this invoice. */
      financialDocumentId?: string;
      lineItems: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        total: number;
      }>;
    },
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const invoice = await prisma.$transaction(async (tx) => {
      const companyRow = await tx.company.findUnique({
        where: { id: companyId },
      });
      if (!companyRow) return null;
      const nextNum =
        Number((companyRow as { nextInvoiceNumber?: number }).nextInvoiceNumber) || 1;
      const invoiceNumber = String(nextNum);
      await tx.company.update({
        where: { id: companyId },
        data: {
          nextInvoiceNumber: nextNum + 1,
        } as Prisma.CompanyUpdateInput,
      });
      const created = await tx.enterpriseInvoice.create({
        data: {
          companyId,
          invoiceNumber,
          clientName: data.clientName,
          clientAddress: data.clientAddress,
          clientEmail: data.clientEmail,
          dateIssued: data.dateIssued,
          dueDate: data.dueDate,
          totalAmount: new Decimal(data.totalAmount),
          notes: data.notes ?? null,
        },
      });
      for (let i = 0; i < data.lineItems.length; i++) {
        const item = data.lineItems[i];
        await tx.enterpriseInvoiceLineItem.create({
          data: {
            invoiceId: created.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: new Decimal(item.unitPrice),
            total: new Decimal(item.total),
            sortOrder: i,
          },
        });
      }
      if (data.financialDocumentId) {
        await linkInvoiceFinancialDocumentInTx(
          tx,
          companyId,
          created.id,
          data.financialDocumentId,
        );
      }
      const full = await tx.enterpriseInvoice.findUnique({
        where: { id: created.id },
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
      });
      return full ? serializeEnterpriseInvoice(full) : null;
    });
    return invoice;
  },

  async listInvoices(
    companyId: string,
    opts?: {
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: "ASC" | "DESC";
      dateFrom?: Date;
      dateTo?: Date;
    },
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 10), 100);
    const order = opts?.sortOrder === "ASC" ? "asc" : "desc";
    const invWhere: {
      companyId: string;
      dateIssued?: { gte?: Date; lte?: Date };
    } = { companyId };
    if (opts?.dateFrom || opts?.dateTo) {
      invWhere.dateIssued = {};
      if (opts.dateFrom) invWhere.dateIssued.gte = opts.dateFrom;
      if (opts.dateTo) invWhere.dateIssued.lte = opts.dateTo;
    }
    const [list, total] = await Promise.all([
      prisma.enterpriseInvoice.findMany({
        where: invWhere,
        orderBy: { dateIssued: order },
        skip: (page - 1) * limit,
        take: limit,
        select: enterpriseInvoiceListSelect,
      }),
      prisma.enterpriseInvoice.count({ where: invWhere }),
    ]);
    const data = list.map((inv) =>
      serializeEnterpriseInvoice(inv as EnterpriseInvoiceWithLineItems),
    );
    return { data, total, page, limit };
  },
};
