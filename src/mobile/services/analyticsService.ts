import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  PERCENT,
  KPI_PERCENT_ROUNDING_FACTOR,
} from "../../constants/percentages";
import { taxComputationService } from "./taxComputationService";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function periodLabel(year: number, month: number): string {
  return `${new Date(year, month - 1).toLocaleString("default", { month: "long" })} ${year}`;
}

function prevPeriod(
  year: number,
  month: number,
): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export type DashboardRange = "month" | "quarter" | "year";

export const analyticsService = {
  async getDashboard(
    userId: string,
    period: string,
    range: DashboardRange = "month",
  ) {
    const match = period.match(/^(\d{4})-(\d{1,2})$/);
    const now = new Date();
    const year = match ? parseInt(match[1], 10) : now.getFullYear();
    const month = match ? parseInt(match[2], 10) : now.getMonth() + 1;
    if (month < 1 || month > 12) {
      throw new Error("Invalid period. Use YYYY-MM.");
    }

    const current = await this.getPeriodAggregates(userId, year, month, range);
    const prev = prevPeriod(year, month);
    const previous = await this.getPeriodAggregates(
      userId,
      prev.year,
      prev.month,
      range,
    );

    const percentChangeIncome =
      previous.income > 0
        ? ((current.income - previous.income) / previous.income) * PERCENT
        : 0;
    const percentChangeExpenses =
      previous.expenses > 0
        ? ((current.expenses - previous.expenses) / previous.expenses) * PERCENT
        : 0;
    const percentChangeNetProfit =
      previous.netProfit !== 0
        ? ((current.netProfit - previous.netProfit) /
            Math.abs(previous.netProfit)) *
          PERCENT
        : 0;
    const margin =
      current.income > 0
        ? (current.netProfit / current.income) * PERCENT
        : 0;
    const prevMargin =
      previous.income > 0
        ? (previous.netProfit / previous.income) * PERCENT
        : 0;
    const percentChangeMargin = prevMargin !== 0 ? margin - prevMargin : 0;

    const incomeTrend = await this.getIncomeTrend(userId, year, month);
    const expenseBreakdown = await this.getExpenseBreakdown(
      userId,
      year,
      month,
    );
    const businessHealth = await this.getBusinessHealth(userId);

    const label =
      range === "month"
        ? periodLabel(year, month)
        : range === "quarter"
          ? `Q${Math.ceil(month / 3)} ${year}`
          : `${year}`;

    return {
      period: { year, month, label, range },
      kpis: {
        income: current.income,
        expenses: current.expenses,
        netProfit: current.netProfit,
        margin:
          Math.round(margin * KPI_PERCENT_ROUNDING_FACTOR) /
          KPI_PERCENT_ROUNDING_FACTOR,
        percentChangeIncome:
          Math.round(percentChangeIncome * KPI_PERCENT_ROUNDING_FACTOR) /
          KPI_PERCENT_ROUNDING_FACTOR,
        percentChangeExpenses:
          Math.round(percentChangeExpenses * KPI_PERCENT_ROUNDING_FACTOR) /
          KPI_PERCENT_ROUNDING_FACTOR,
        percentChangeNetProfit:
          Math.round(percentChangeNetProfit * KPI_PERCENT_ROUNDING_FACTOR) /
          KPI_PERCENT_ROUNDING_FACTOR,
        percentChangeMargin:
          Math.round(percentChangeMargin * KPI_PERCENT_ROUNDING_FACTOR) /
          KPI_PERCENT_ROUNDING_FACTOR,
      },
      profitAndLoss: {
        revenue: current.income,
        operatingExpenses: current.expenses,
        netProfit: current.netProfit,
        /** Net profit as % of revenue (0–100), one decimal; uses PERCENT + KPI rounding. */
        profitMarginPercent:
          current.income > 0
            ? Math.round(
                (current.netProfit / current.income) *
                  PERCENT *
                  KPI_PERCENT_ROUNDING_FACTOR,
              ) / KPI_PERCENT_ROUNDING_FACTOR
            : 0,
      },
      incomeTrend,
      expenseBreakdown,
      businessHealth,
    };
  },

  async getPeriodAggregates(
    userId: string,
    year: number,
    month: number,
    range: DashboardRange,
  ): Promise<{ income: number; expenses: number; netProfit: number }> {
    if (range === "month") {
      const comp = await taxComputationService.getForPeriod(
        userId,
        year,
        month,
      );
      return {
        income: comp.overview.totalIncome,
        expenses: comp.overview.totalExpenses,
        netProfit: comp.overview.netProfit,
      };
    }
    let income = 0;
    let expenses = 0;
    const months = range === "quarter" ? 3 : 12;
    let y = year;
    let m = month;
    for (let i = 0; i < months; i++) {
      const comp = await taxComputationService.getForPeriod(userId, y, m);
      income += comp.overview.totalIncome;
      expenses += comp.overview.totalExpenses;
      m--;
      if (m < 1) {
        m = 12;
        y--;
      }
    }
    return { income, expenses, netProfit: income - expenses };
  },

  async getIncomeTrend(userId: string, endYear: number, endMonth: number) {
    const items: {
      label: string;
      year: number;
      month: number;
      income: number;
    }[] = [];
    let y = endYear;
    let m = endMonth;
    for (let i = 0; i < 6; i++) {
      const comp = await taxComputationService.getForPeriod(userId, y, m);
      items.unshift({
        label: new Date(y, m - 1).toLocaleString("default", { month: "short" }),
        year: y,
        month: m,
        income: comp.overview.totalIncome,
      });
      m--;
      if (m < 1) {
        m = 12;
        y--;
      }
    }
    return items;
  },

  async getExpenseBreakdown(userId: string, year: number, month: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    const byCategory = await prisma.expense.groupBy({
      by: ["category"],
      where: { userId, expenseDate: { gte: start, lte: end } },
      _sum: { totalAmount: true },
    });
    const total = byCategory.reduce(
      (s, c) => s + decimalToNumber(c._sum.totalAmount),
      0,
    );
    return byCategory.map((c) => ({
      category: c.category,
      amount: decimalToNumber(c._sum.totalAmount),
      percentageOfTotal:
        total > 0
          ? (decimalToNumber(c._sum.totalAmount) / total) * PERCENT
          : 0,
    }));
  },

  async getBusinessHealth(userId: string) {
    const payables = await prisma.taxPayable.findMany({
      where: { userId },
      include: { payments: { where: { status: "completed" } } },
    });
    const now = new Date();
    let overdueCount = 0;
    let paidCount = 0;
    for (const p of payables) {
      const totalPayable = decimalToNumber(p.totalPayable);
      const totalPaid = p.payments.reduce(
        (s, r) => s + decimalToNumber(r.amountPaid),
        0,
      );
      if (totalPaid >= totalPayable && totalPayable > 0) paidCount++;
      else if (p.filingDueDate < now) overdueCount++;
    }
    const total = payables.length;
    const taxCompliance =
      total === 0
        ? "On Track"
        : overdueCount === 0
          ? "On Track"
          : overdueCount < total
            ? "At Risk"
            : "Overdue";
    const profitability = "Strong";
    const cashFlow = overdueCount > 0 ? "Fair" : "Strong";
    return [
      { indicator: "Profitability", status: profitability },
      { indicator: "Tax Compliance", status: taxCompliance },
      { indicator: "Cash Flow", status: cashFlow },
    ];
  },
};
