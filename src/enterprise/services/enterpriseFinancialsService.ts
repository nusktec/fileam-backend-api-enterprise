import { prisma } from "../../config/database";
import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
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
    },
    linkedUserId?: string,
  ) {
    if (linkedUserId) {
      const { getClientTransactions } = await import("./clientDataHelper");
      return getClientTransactions(linkedUserId, {
        limit: opts?.limit,
        page: opts?.page,
        sortOrder: opts?.sortOrder === "ASC" ? "asc" : "desc",
      });
    }
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 10), 100);
    const order = opts?.sortOrder === "ASC" ? "asc" : "desc";
    const [list, total] = await Promise.all([
      prisma.enterpriseTransaction.findMany({
        where: { companyId },
        orderBy: { date: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.enterpriseTransaction.count({ where: { companyId } }),
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
    },
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
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

  async uploadDocument(companyId: string, data: FinancialDocumentUploadInput) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    return prisma.enterpriseFinancialDocument.create({
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
    return {
      ...invoice,
      totalAmount: decimalToNumber(invoice.totalAmount),
      lineItems: invoice.lineItems.map((l) => ({
        ...l,
        unitPrice: decimalToNumber(l.unitPrice),
        total: decimalToNumber(l.total),
      })),
    };
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
    return prisma.enterpriseInvoice.findUnique({
      where: { id: invoiceId },
      include: { lineItems: true },
    });
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
    return prisma.enterpriseInvoice.findUnique({ where: { id: invoiceId } });
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
      return tx.enterpriseInvoice.findUnique({
        where: { id: created.id },
        include: { lineItems: true },
      });
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
    },
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 10), 100);
    const order = opts?.sortOrder === "ASC" ? "asc" : "desc";
    const [list, total] = await Promise.all([
      prisma.enterpriseInvoice.findMany({
        where: { companyId },
        orderBy: { dateIssued: order },
        skip: (page - 1) * limit,
        take: limit,
        include: { lineItems: true },
      }),
      prisma.enterpriseInvoice.count({ where: { companyId } }),
    ]);
    return { data: list, total, page, limit };
  },
};
