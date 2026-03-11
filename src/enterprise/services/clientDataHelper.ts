import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

export async function getClientTransactions(
  userId: string,
  opts?: { limit?: number; page?: number; sortOrder?: "asc" | "desc" },
) {
  const limit = opts?.limit ?? 10;
  const page = opts?.page ?? 1;
  const order = opts?.sortOrder === "asc" ? "asc" : "desc";

  const [sales, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: { userId },
      orderBy: { saleDate: order },
    }),
    prisma.expense.findMany({
      where: { userId },
      orderBy: { expenseDate: order },
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
    })),
    ...expenses.map((e) => ({
      id: `expense-${e.id}`,
      date: e.expenseDate,
      description: `${e.category}: ${e.description}`,
      amount: -decimalToNumber(e.totalAmount),
      status: "Recorded",
      type: "expense",
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
