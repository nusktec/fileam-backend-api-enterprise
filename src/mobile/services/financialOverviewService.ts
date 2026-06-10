import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  ENTERPRISE_POTENTIAL_TAX_SAVINGS_CAP_NGN,
  ENTERPRISE_POTENTIAL_TAX_SAVINGS_RATE,
} from "../../constants/percentages";
import { monthDateRangeUtc } from "../../utils/dateRangeQuery";
import { taxPayablesService } from "./taxPayablesService";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export const financialOverviewService = {
  async getOverview(userId: string, year: number) {
    const { start } = monthDateRangeUtc(year, 1);
    const { end } = monthDateRangeUtc(year, 12);

    const periods = Array.from({ length: 12 }, (_, i) => ({
      year,
      month: i + 1,
    }));
    await taxPayablesService.syncPayablesForPeriods(userId, periods);

    const [salesAgg, expensesAgg, payables] = await Promise.all([
      prisma.sale.aggregate({
        where: { userId, saleDate: { gte: start, lte: end } },
        _sum: { totalAmount: true },
      }),
      prisma.expense.aggregate({
        where: { userId, expenseDate: { gte: start, lte: end } },
        _sum: { totalAmount: true },
      }),
      prisma.taxPayable.findMany({
        where: { userId, periodYear: year },
        include: { payments: { where: { status: "completed" } } },
      }),
    ]);

    const annualRevenue = roundMoney(decimalToNumber(salesAgg._sum.totalAmount));
    const annualExpense = roundMoney(
      decimalToNumber(expensesAgg._sum.totalAmount),
    );

    const taxLiabilityByType: Record<string, number> = {};
    let currentTaxLiability = 0;

    for (const p of payables) {
      const totalPayable = decimalToNumber(p.totalPayable);
      const totalPaid = p.payments.reduce(
        (s, r) => s + decimalToNumber(r.amountPaid),
        0,
      );
      const remaining = Math.max(0, totalPayable - totalPaid);
      if (remaining <= 0) continue;
      currentTaxLiability += remaining;
      taxLiabilityByType[p.taxType] =
        roundMoney((taxLiabilityByType[p.taxType] ?? 0) + remaining);
    }

    currentTaxLiability = roundMoney(currentTaxLiability);
    const potentialSavings = roundMoney(
      Math.min(
        currentTaxLiability * ENTERPRISE_POTENTIAL_TAX_SAVINGS_RATE,
        ENTERPRISE_POTENTIAL_TAX_SAVINGS_CAP_NGN,
      ),
    );

    return {
      year,
      currency: "NGN",
      annualRevenue,
      annualExpense,
      netProfit: roundMoney(annualRevenue - annualExpense),
      currentTaxLiability,
      potentialSavings,
      taxLiabilityByType,
      note:
        "Revenue and expenses are book totals for the calendar year. Tax liability is unpaid balance on synced payables for that year. Potential savings is an indicative estimate (5% of liability, capped) — consult a tax adviser for actual planning.",
    };
  },
};
