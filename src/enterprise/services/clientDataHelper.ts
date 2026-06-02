import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { PERCENT, KPI_PERCENT_ROUNDING_FACTOR } from "../../constants/percentages";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

export async function getClientTransactions(
  userId: string,
  opts?: {
    limit?: number;
    page?: number;
    sortOrder?: "asc" | "desc";
    dateFrom?: Date;
    dateTo?: Date;
  },
) {
  const limit = opts?.limit ?? 10;
  const page = opts?.page ?? 1;
  const order = opts?.sortOrder === "asc" ? "asc" : "desc";

  const saleWhere: { userId: string; saleDate?: { gte?: Date; lte?: Date } } = {
    userId,
  };
  const expenseWhere: {
    userId: string;
    expenseDate?: { gte?: Date; lte?: Date };
  } = { userId };
  if (opts?.dateFrom || opts?.dateTo) {
    const r = { gte: opts.dateFrom, lte: opts.dateTo };
    saleWhere.saleDate = { ...r };
    expenseWhere.expenseDate = { ...r };
  }

  const [sales, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: saleWhere,
      orderBy: [{ saleDate: order }, { createdAt: order }],
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.expense.findMany({
      where: expenseWhere,
      orderBy: [{ expenseDate: order }, { createdAt: order }],
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);

  const items = [
    ...sales.map((s) => ({
      id: `sale-${s.id}`,
      date: s.saleDate,
      description: `Invoice ${s.invoiceNumber}${s.customerName ? ` - ${s.customerName}` : ""}`,
      amount: decimalToNumber(s.totalAmount),
      status: s.status,
      type: "income",
      customerName: s.customerName ?? null,
      customerId: s.customerId ?? null,
      createdById: s.createdById ?? s.userId,
      createdBy: s.createdBy
        ? { id: s.createdBy.id, name: `${s.createdBy.firstName} ${s.createdBy.lastName}`.trim() }
        : null,
    })),
    ...expenses.map((e) => ({
      id: `expense-${e.id}`,
      date: e.expenseDate,
      description: `${e.category}: ${e.description}`,
      amount: -decimalToNumber(e.totalAmount),
      status: "Recorded",
      type: "expense",
      supplierName: e.supplierName ?? null,
      supplierId: e.supplierId ?? null,
      createdById: e.createdById ?? e.userId,
      createdBy: e.createdBy
        ? { id: e.createdBy.id, name: `${e.createdBy.firstName} ${e.createdBy.lastName}`.trim() }
        : null,
    })),
  ].sort((a, b) => {
    const diff = b.date.getTime() - a.date.getTime();
    return order === "desc" ? diff : -diff;
  });

  const total = items.length;
  const start = (page - 1) * limit;
  const data = items.slice(start, start + limit);

  return { data, total, page, limit };
}

export async function getClientFinancialSummary(userId: string) {
  const [salesSum, expensesSum] = await Promise.all([
    prisma.sale.aggregate({
      where: { userId },
      _sum: { totalAmount: true },
    }),
    prisma.expense.aggregate({
      where: { userId },
      _sum: { totalAmount: true },
    }),
  ]);
  const totalIncome = decimalToNumber(salesSum._sum.totalAmount);
  const totalExpenses = decimalToNumber(expensesSum._sum.totalAmount);
  return {
    totalIncome,
    totalExpenses,
    netProfit: totalIncome - totalExpenses,
  };
}

export async function getClientExpenseBreakdown(userId: string, year?: number) {
  const y = year ?? new Date().getFullYear();
  const expenses = await prisma.expense.findMany({
    where: {
      userId,
      expenseDate: {
        gte: new Date(y, 0, 1),
        lte: new Date(y, 11, 31),
      },
    },
  });
  const byCategory: Record<string, number> = {};
  for (const e of expenses) {
    const cat = e.category || "Other";
    byCategory[cat] = (byCategory[cat] ?? 0) + Number(e.totalAmount);
  }
  return Object.entries(byCategory).map(([category, total]) => ({
    category,
    total,
  }));
}

export async function getClientMonthlyCashFlow(userId: string, year: number) {
  const [sales, expenses] = await Promise.all([
    prisma.sale.findMany({ where: { userId } }),
    prisma.expense.findMany({ where: { userId } }),
  ]);
  const byMonth: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) byMonth[m] = 0;
  for (const s of sales) {
    const d = new Date(s.saleDate);
    if (d.getFullYear() === year)
      byMonth[d.getMonth() + 1] += decimalToNumber(s.totalAmount);
  }
  for (const e of expenses) {
    const d = new Date(e.expenseDate);
    if (d.getFullYear() === year)
      byMonth[d.getMonth() + 1] -= decimalToNumber(e.totalAmount);
  }
  return Object.entries(byMonth).map(([month, value]) => ({
    month: Number(month),
    year,
    value,
  }));
}

export type ClientPlRange = { start: Date; end: Date };

/** Profit & loss for a client in [start, end] (inclusive by date). */
export async function getClientPlBreakdown(userId: string, range: ClientPlRange) {
  const start = new Date(range.start);
  start.setHours(0, 0, 0, 0);
  const end = new Date(range.end);
  end.setHours(23, 59, 59, 999);

  const [sales, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: { userId, saleDate: { gte: start, lte: end } },
    }),
    prisma.expense.findMany({
      where: { userId, expenseDate: { gte: start, lte: end } },
    }),
  ]);

  const revenueTotal = sales.reduce(
    (s, x) => s + decimalToNumber(x.totalAmount),
    0,
  );
  const expenseTotal = expenses.reduce(
    (s, x) => s + decimalToNumber(x.totalAmount),
    0,
  );
  const netProfit = revenueTotal - expenseTotal;

  const revenueByCategory: Record<string, number> = {};
  for (const s of sales) {
    const c = s.category?.trim() || "Uncategorized";
    revenueByCategory[c] =
      (revenueByCategory[c] ?? 0) + decimalToNumber(s.totalAmount);
  }
  const expensesByCategory: Record<string, number> = {};
  for (const e of expenses) {
    const c = e.category?.trim() || "Other";
    expensesByCategory[c] =
      (expensesByCategory[c] ?? 0) + decimalToNumber(e.totalAmount);
  }

  const byMonthKey = new Map<
    string,
    { revenue: number; expenses: number; net: number }
  >();
  for (const s of sales) {
    const d = new Date(s.saleDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const row = byMonthKey.get(key) ?? { revenue: 0, expenses: 0, net: 0 };
    row.revenue += decimalToNumber(s.totalAmount);
    row.net = row.revenue - row.expenses;
    byMonthKey.set(key, row);
  }
  for (const e of expenses) {
    const d = new Date(e.expenseDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const row = byMonthKey.get(key) ?? { revenue: 0, expenses: 0, net: 0 };
    row.expenses += decimalToNumber(e.totalAmount);
    row.net = row.revenue - row.expenses;
    byMonthKey.set(key, row);
  }

  const monthlyBreakdown = [...byMonthKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, v]) => ({
      period,
      revenue: v.revenue,
      expenses: v.expenses,
      netProfit: v.net,
    }));

  const profitMarginPercent =
    revenueTotal > 0
      ? Math.round(
          (netProfit / revenueTotal) *
            PERCENT *
            KPI_PERCENT_ROUNDING_FACTOR,
        ) / KPI_PERCENT_ROUNDING_FACTOR
      : 0;

  const formulas = {
    netProfit: "sum(sale.totalAmount for saleDate in range) − sum(expense.totalAmount for expenseDate in range)",
    profitMarginPercent:
      "round((netProfit ÷ revenueTotal) × 100, 1 decimal) or 0 if revenue is 0",
    revenueByCategory: "Per sale row: add totalAmount to bucket category || 'Uncategorized'",
    expensesByCategory: "Per expense row: add totalAmount to bucket category || 'Other'",
  };

  return {
    range: { start: start.toISOString(), end: end.toISOString() },
    revenueTotal,
    expenseTotal,
    netProfit,
    profitMarginPercent,
    revenueByCategory,
    expensesByCategory,
    monthlyBreakdown,
    formulas,
    recordCounts: {
      sales: sales.length,
      expenses: expenses.length,
    },
  };
}

/** Sales with no documentUrl, no evidenceVaultId, and no receiptUrl; expenses with no receiptUrl — in range. */
export async function getClientAttachmentGaps(userId: string, range: ClientPlRange) {
  const start = new Date(range.start);
  start.setHours(0, 0, 0, 0);
  const end = new Date(range.end);
  end.setHours(23, 59, 59, 999);

  const [salesMissing, expensesMissing] = await Promise.all([
    prisma.sale.count({
      where: {
        userId,
        saleDate: { gte: start, lte: end },
        documentUrl: null,
        evidenceVaultId: null,
        receiptUrl: null,
      },
    }),
    prisma.expense.count({
      where: {
        userId,
        expenseDate: { gte: start, lte: end },
        receiptUrl: null,
      },
    }),
  ]);

  return {
    salesWithoutInvoiceOrVaultAttachment: salesMissing,
    expensesWithoutReceipt: expensesMissing,
  };
}
