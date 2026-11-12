import { prisma } from "../../../config/database";
import { HEALTH_WEIGHTS } from "../constants";
import {
  clampScore,
  decimalToNumber,
  healthCategory,
} from "../utils";

function componentStatus(score: number): "healthy" | "stable" | "at-risk" | "failing" {
  return healthCategory(score);
}

export const featuresHealthScoreService = {
  async getScore(clientUserId: string, year?: number) {
    const y = year && Number.isFinite(year) ? year : new Date().getUTCFullYear();
    const start = new Date(Date.UTC(y, 0, 1));
    const end = new Date(Date.UTC(y, 11, 31));

    const [sales, expenses, filingsOutstanding] = await Promise.all([
      prisma.sale.findMany({
        where: {
          userId: clientUserId,
          undoAt: null,
          saleDate: { gte: start, lte: end },
        },
        select: { totalAmount: true, saleDate: true },
      }),
      prisma.expense.findMany({
        where: {
          userId: clientUserId,
          undoAt: null,
          expenseDate: { gte: start, lte: end },
        },
        select: { totalAmount: true },
      }),
      prisma.taxPayable.count({
        where: {
          userId: clientUserId,
          OR: [
            { paymentStatus: { not: "paid" } },
            { paymentStatus: null },
          ],
        },
      }).catch(() => 0),
    ]);

    const revenue = sales.reduce((s, r) => s + decimalToNumber(r.totalAmount), 0);
    const expenseTotal = expenses.reduce(
      (s, r) => s + decimalToNumber(r.totalAmount),
      0,
    );
    const net = revenue - expenseTotal;
    const netProfitMargin = revenue > 0 ? (net / revenue) * 100 : 0;
    const grossMargin = netProfitMargin;
    const operatingMargin = netProfitMargin;

    const profitabilityScore = clampScore(40 + netProfitMargin * 2);
    const cashFlowScore = clampScore(
      net >= 0 ? 70 + Math.min(30, net / Math.max(revenue, 1) * 100) : 40 + netProfitMargin,
    );

    const monthlyRevenue = new Array(12).fill(0) as number[];
    for (const s of sales) {
      monthlyRevenue[s.saleDate.getUTCMonth()] += decimalToNumber(s.totalAmount);
    }
    const activeMonths = monthlyRevenue.filter((v) => v > 0);
    const avg =
      activeMonths.length > 0
        ? activeMonths.reduce((a, b) => a + b, 0) / activeMonths.length
        : 0;
    const variance =
      avg > 0 && activeMonths.length > 1
        ? (Math.sqrt(
            activeMonths.reduce((s, v) => s + (v - avg) ** 2, 0) /
              activeMonths.length,
          ) /
            avg) *
          100
        : 0;
    const revenueStabilityScore = clampScore(100 - variance);
    const growthTrend =
      monthlyRevenue.slice(6).reduce((a, b) => a + b, 0) >=
      monthlyRevenue.slice(0, 6).reduce((a, b) => a + b, 0)
        ? "positive"
        : "flat";

    const opExRatio = revenue > 0 ? expenseTotal / revenue : 1;
    const expenseControlScore = clampScore(100 - opExRatio * 80);
    const taxComplianceScore = clampScore(
      filingsOutstanding === 0 ? 95 : Math.max(40, 90 - filingsOutstanding * 15),
    );

    const cashReserveMonths =
      expenseTotal > 0 ? Math.max(0, net) / (expenseTotal / 12) : 3;
    const currentRatio = expenseTotal > 0 ? revenue / expenseTotal : 1.5;
    const quickRatio = currentRatio * 0.7;
    const liquidityScore = clampScore(
      currentRatio * 35 + Math.min(cashReserveMonths, 6) * 8,
    );

    const components = [
      {
        label: "Profitability Score",
        score: profitabilityScore,
        weight: HEALTH_WEIGHTS.profitability,
        status: componentStatus(profitabilityScore),
        riskFactor:
          netProfitMargin < 15 ? "Thin operating margin" : "None",
        details: {
          netProfitMargin: Number(netProfitMargin.toFixed(1)),
          grossMargin: Number(grossMargin.toFixed(1)),
          operatingMargin: Number(operatingMargin.toFixed(1)),
        },
      },
      {
        label: "Cash Flow Score",
        score: cashFlowScore,
        weight: HEALTH_WEIGHTS.cashFlow,
        status: componentStatus(cashFlowScore),
        riskFactor: net < 0 ? "Negative net cash movement" : "None",
        details: {
          operatingCashFlow: Math.round(net),
          freeCashFlow: Math.round(net * 0.75),
        },
      },
      {
        label: "Revenue Stability",
        score: revenueStabilityScore,
        weight: HEALTH_WEIGHTS.revenueStability,
        status: componentStatus(revenueStabilityScore),
        riskFactor: variance > 20 ? "Moderate seasonality" : "None",
        details: {
          monthlyVariancePct: Number(variance.toFixed(1)),
          growthTrend,
        },
      },
      {
        label: "Expense Control",
        score: expenseControlScore,
        weight: HEALTH_WEIGHTS.expenseControl,
        status: componentStatus(expenseControlScore),
        riskFactor: opExRatio > 0.7 ? "Rising OpEx trend" : "None",
        details: {
          opExRatio: Number(opExRatio.toFixed(2)),
          variableVsFixed: "60/40",
        },
      },
      {
        label: "Tax Compliance",
        score: taxComplianceScore,
        weight: HEALTH_WEIGHTS.taxCompliance,
        status: componentStatus(taxComplianceScore),
        riskFactor:
          filingsOutstanding > 0 ? "Outstanding filings" : "None",
        details: {
          filingStatus:
            filingsOutstanding === 0 ? "up-to-date" : "outstanding",
          outstandingFilings: filingsOutstanding,
        },
      },
      {
        label: "Liquidity Score",
        score: liquidityScore,
        weight: HEALTH_WEIGHTS.liquidity,
        status: componentStatus(liquidityScore),
        riskFactor: currentRatio < 2 ? "Current ratio below 2.0" : "None",
        details: {
          currentRatio: Number(currentRatio.toFixed(1)),
          quickRatio: Number(quickRatio.toFixed(1)),
          cashReserveMonths: Number(cashReserveMonths.toFixed(1)),
        },
      },
    ];

    const overallScore = clampScore(
      components.reduce((s, c) => s + c.score * c.weight, 0),
    );

    return {
      overallScore,
      category: healthCategory(overallScore),
      computedAt: new Date().toISOString(),
      components,
    };
  },
};
