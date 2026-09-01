import { prisma } from "../../config/database";
import { isValidSupplierDocumentType } from "../../constants/directory";
import {
  isInvoicePaymentType,
  isSalePaidStatus,
  resolveSaleInvoiceStatus,
  SALE_STATUS,
} from "../../constants/salePaymentRules";
import { coerceInvoiceAmountPaid } from "../../constants/invoiceAmountPaid";
import { nextDisplayCode } from "../../utils/codeGenerator";
import { HttpReplyError } from "../../utils/httpReplyError";
import {
  formatYmd,
  summarizeExpensesForPayable,
} from "../../utils/transactionSummaryHelper";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import {
  assertSupplierContactUniqueness,
  normalizeDirectoryPhone,
  normalizeDirectoryTin,
} from "../../utils/directoryContactUniqueness";
import { Decimal } from "@prisma/client/runtime/library";

const SUPPLIER_COUNTER = "supplier_code";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  return Number(v);
}

async function findSupplier(userId: string, supplierIdOrCode: string) {
  return prisma.supplier.findFirst({
    where: {
      userId,
      OR: [{ id: supplierIdOrCode }, { supplierCode: supplierIdOrCode }],
    },
  });
}

function mapExpenseRow(e: {
  id: string;
  expenseNumber: string;
  description: string;
  totalAmount: Decimal;
  paymentType: string;
  status: string;
  expenseDate: Date;
  supplierName: string | null;
  supplierId: string | null;
}) {
  return {
    id: e.expenseNumber,
    uuid: e.id,
    description: e.description,
    totalAmount: d(e.totalAmount),
    paymentType: e.paymentType,
    status: resolveSaleInvoiceStatus(e),
    date: formatYmd(e.expenseDate),
    supplier: e.supplierId
      ? { id: e.supplierId, name: e.supplierName ?? "" }
      : null,
  };
}

async function supplierExpenses(userId: string, supplierCode: string) {
  return prisma.expense.findMany({
    where: { userId, supplierId: supplierCode },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
  });
}

function supplierListMetrics(
  expenses: Awaited<ReturnType<typeof supplierExpenses>>,
) {
  const summary = summarizeExpensesForPayable(expenses);
  let lastTransactionDate: string | null = null;
  if (expenses.length > 0) {
    lastTransactionDate = formatYmd(expenses[0]!.expenseDate);
  }
  return {
    totalPurchaseAmount: summary.totalPurchaseAmount,
    outstandingBalance: summary.outstandingPayable,
    lastTransactionDate,
  };
}

export const suppliersService = {
  async create(
    userId: string,
    data: {
      name: string;
      phone: string;
      address: string;
      businessName?: string;
      email?: string;
      contactPerson?: string;
      tin?: string;
    },
  ) {
    const phone = normalizeDirectoryPhone(data.phone);
    const tin = normalizeDirectoryTin(data.tin);
    await assertSupplierContactUniqueness(userId, { phone, tin });

    const supplierCode = await nextDisplayCode(SUPPLIER_COUNTER, "SUP");
    const row = await prisma.supplier.create({
      data: {
        userId,
        supplierCode,
        name: data.name.trim(),
        phone,
        address: data.address.trim(),
        businessName: data.businessName?.trim() || null,
        email: data.email?.trim() || null,
        contactPerson: data.contactPerson?.trim() || null,
        tin,
        status: "ACTIVE",
      },
    });
    return {
      id: row.supplierCode,
      uuid: row.id,
      name: row.name,
      phone: row.phone,
      address: row.address,
      businessName: row.businessName,
      email: row.email,
      contactPerson: row.contactPerson,
      tin: row.tin,
      status: row.status,
      dateAdded: formatYmd(row.createdAt),
    };
  },

  async update(
    userId: string,
    supplierIdOrCode: string,
    data: {
      name?: string;
      phone?: string;
      address?: string;
      businessName?: string | null;
      email?: string | null;
      contactPerson?: string | null;
      tin?: string | null;
    },
  ) {
    const row = await findSupplier(userId, supplierIdOrCode);
    if (!row) throw new HttpReplyError(404, "Supplier not found");

    const phone =
      data.phone !== undefined
        ? normalizeDirectoryPhone(data.phone)
        : row.phone;
    const tin =
      data.tin !== undefined ? normalizeDirectoryTin(data.tin) : row.tin;
    await assertSupplierContactUniqueness(
      userId,
      { phone, tin },
      row.id,
    );

    const updated = await prisma.supplier.update({
      where: { id: row.id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.phone !== undefined ? { phone } : {}),
        ...(data.address !== undefined ? { address: data.address.trim() } : {}),
        ...(data.businessName !== undefined
          ? { businessName: data.businessName?.trim() || null }
          : {}),
        ...(data.email !== undefined
          ? { email: data.email?.trim() || null }
          : {}),
        ...(data.contactPerson !== undefined
          ? { contactPerson: data.contactPerson?.trim() || null }
          : {}),
        ...(data.tin !== undefined ? { tin } : {}),
      },
    });

    return {
      id: updated.supplierCode,
      uuid: updated.id,
      name: updated.name,
      phone: updated.phone,
      address: updated.address,
      businessName: updated.businessName,
      email: updated.email,
      contactPerson: updated.contactPerson,
      tin: updated.tin,
      status: updated.status,
      dateAdded: formatYmd(updated.createdAt),
    };
  },

  async getById(userId: string, supplierIdOrCode: string) {
    const row = await findSupplier(userId, supplierIdOrCode);
    if (!row) throw new HttpReplyError(404, "Supplier not found");

    const [expenses, documents] = await Promise.all([
      supplierExpenses(userId, row.supplierCode),
      prisma.supplierDocument.findMany({
        where: { supplierId: row.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const metrics = supplierListMetrics(expenses);

    return {
      id: row.supplierCode,
      uuid: row.id,
      name: row.name,
      businessName: row.businessName,
      phone: row.phone,
      email: row.email,
      contactPerson: row.contactPerson,
      tin: row.tin,
      address: row.address,
      status: row.status,
      dateAdded: formatYmd(row.createdAt),
      lastTransactionDate: metrics.lastTransactionDate,
      payableSummary: summarizeExpensesForPayable(expenses),
      expenses: expenses.map(mapExpenseRow),
      documents: documents.map((doc) => ({
        id: doc.id,
        expenseId: doc.expenseId,
        type: doc.type,
        url: doc.url,
        createdAt: doc.createdAt.toISOString(),
      })),
    };
  },

  async dashboard(userId: string) {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    const [suppliers, allExpenses] = await Promise.all([
      prisma.supplier.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.expense.findMany({ where: { userId } }),
    ]);

    const expensesBySupplier = new Map<string, typeof allExpenses>();
    for (const e of allExpenses) {
      if (!e.supplierId) continue;
      const list = expensesBySupplier.get(e.supplierId) ?? [];
      list.push(e);
      expensesBySupplier.set(e.supplierId, list);
    }

    const supplierRows = suppliers.map((s) => {
      const expenses = expensesBySupplier.get(s.supplierCode) ?? [];
      const metrics = supplierListMetrics(expenses);
      return {
        id: s.supplierCode,
        name: s.name,
        businessName: s.businessName,
        phone: s.phone,
        email: s.email,
        status: s.status,
        totalPurchaseAmount: metrics.totalPurchaseAmount,
        outstandingBalance: metrics.outstandingBalance,
        lastTransactionDate: metrics.lastTransactionDate,
      };
    });

    const newSuppliersThisMonth = suppliers.filter(
      (s) => s.createdAt >= monthStart && s.createdAt < monthEnd,
    ).length;

    const activeSuppliers = suppliers.filter((s) => s.status === "ACTIVE")
      .length;

    const suppliersWithOutstandingBalances = supplierRows.filter(
      (s) => s.outstandingBalance > 0,
    ).length;

    const topSuppliers = [...supplierRows]
      .sort((a, b) => b.totalPurchaseAmount - a.totalPurchaseAmount)
      .slice(0, 5);

    const upcomingSupplierPayments = allExpenses
      .filter((e) => {
        if (!isInvoicePaymentType(e.paymentType)) return false;
        const resolved = resolveSaleInvoiceStatus(e);
        if (isSalePaidStatus(resolved) || resolved === SALE_STATUS.CANCELLED) {
          return false;
        }
        if (!e.invoiceDueDate) return false;
        return e.invoiceDueDate >= now;
      })
      .map((e) => {
        const total = d(e.totalAmount);
        const paid = coerceInvoiceAmountPaid(e.invoiceAmountPaid).total;
        return {
          supplierId: e.supplierId,
          supplierName: e.supplierName,
          expenseNumber: e.expenseNumber,
          dueDate: formatYmd(e.invoiceDueDate),
          amountDue: normalizeMoneyAmount(Math.max(0, total - paid)),
        };
      })
      .slice(0, 20);

    return {
      totalSuppliers: suppliers.length,
      newSuppliersThisMonth,
      activeSuppliers,
      suppliersWithOutstandingBalances,
      topSuppliers,
      upcomingSupplierPayments,
      suppliers: supplierRows,
    };
  },

  async uploadDocument(
    userId: string,
    supplierIdOrCode: string,
    data: { expenseId: string; type: string; url: string },
  ) {
    const supplier = await findSupplier(userId, supplierIdOrCode);
    if (!supplier) throw new HttpReplyError(404, "Supplier not found");
    if (!isValidSupplierDocumentType(data.type)) {
      throw new HttpReplyError(400, "Invalid supplier document type");
    }

    const expense = await prisma.expense.findFirst({
      where: {
        userId,
        OR: [{ id: data.expenseId }, { expenseNumber: data.expenseId }],
      },
    });
    if (!expense) throw new HttpReplyError(404, "Expense not found");
    if (expense.supplierId && expense.supplierId !== supplier.supplierCode) {
      throw new HttpReplyError(
        400,
        "Expense does not belong to this supplier",
      );
    }

    const doc = await prisma.supplierDocument.create({
      data: {
        userId,
        supplierId: supplier.id,
        expenseId: expense.expenseNumber,
        type: data.type,
        url: data.url.trim(),
      },
    });

    return {
      id: doc.id,
      expenseId: doc.expenseId,
      type: doc.type,
      url: doc.url,
      createdAt: doc.createdAt.toISOString(),
    };
  },
};
