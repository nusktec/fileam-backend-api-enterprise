import { prisma } from "../../config/database";
import { PERCENT } from "../../constants/percentages";
import { HttpReplyError } from "../../utils/httpReplyError";
import { clientApplicationCitRate } from "./clientCitRate";
import {
  buildLedgerBalanceSheet,
  chartNetByCode,
  chartSum,
  ledgerNetByRawCode,
} from "./ledgerBalanceSheet";
import { featuresHealthScoreService } from "../features/services/healthScoreService";

const FILING_STEPS = [
  "Validation",
  "Data",
  "Computation",
  "Adjustments",
  "Forms",
  "Evidence",
  "Package",
  "Review",
  "Portal",
] as const;

function n(value: unknown): number {
  return Number(value ?? 0);
}

function round(value: number): number {
  return Math.round(value);
}

export const specBacklogService = {
  async profitabilityOverview(clientUserId: string, year?: number) {
    const y = year && Number.isFinite(year) ? year : new Date().getFullYear();
    const start = new Date(y, 0, 1);
    const end = new Date(y, 11, 31, 23, 59, 59, 999);
    const prevStart = new Date(y - 1, 0, 1);
    const prevEnd = new Date(y - 1, 11, 31, 23, 59, 59, 999);

    const [sales, expenses, prevSales, healthScoreResult, dAndARaw, equityBalances] = await Promise.all([
      prisma.sale.findMany({
        where: { userId: clientUserId, undoAt: null, saleDate: { gte: start, lte: end } },
      }),
      prisma.expense.findMany({
        where: {
          userId: clientUserId,
          undoAt: null,
          expenseDate: { gte: start, lte: end },
        },
      }),
      prisma.sale.findMany({
        where: {
          userId: clientUserId,
          undoAt: null,
          saleDate: { gte: prevStart, lte: prevEnd },
        },
        select: { totalAmount: true },
      }),
      featuresHealthScoreService.getScore(clientUserId, y),
      ledgerNetByRawCode(clientUserId, {
        from: new Date(Date.UTC(y, 0, 1)),
        to: new Date(Date.UTC(y, 11, 31)),
      }),
      buildLedgerBalanceSheet(clientUserId, new Date(Date.UTC(y, 11, 31))),
    ]);

    const revenue = round(sales.reduce((s, r) => s + n(r.totalAmount), 0));
    const prevRevenue = round(prevSales.reduce((s, r) => s + n(r.totalAmount), 0));
    const costOfSales = round(
      expenses
        .filter((e) => e.expenseType === "COGS")
        .reduce((s, e) => s + n(e.totalAmount), 0),
    );
    const operatingExpenses = round(
      expenses
        .filter((e) => e.expenseType === "OPEX")
        .reduce((s, e) => s + n(e.totalAmount), 0),
    );
    const { chart: periodChart } = chartNetByCode(dAndARaw);
    const salaries = round(chartSum(periodChart, ["6110", "6120"]));
    const otherOperatingExpenses = operatingExpenses;
    const expenseTotal = costOfSales + operatingExpenses;
    const grossProfit = revenue - costOfSales;
    const ebitda = grossProfit - operatingExpenses;
    const depreciationAmortisation = round(chartSum(periodChart, ["6240", "6250"]));
    const ebit = ebitda - depreciationAmortisation;
    const interestExpense = round(chartSum(periodChart, ["7110"]));
    const citRate = await clientApplicationCitRate({ clientUserId });
    const taxExpense = round(
      Math.max(0, ebit - interestExpense) * (citRate / PERCENT),
    );
    const netProfit = ebit - interestExpense - taxExpense;
    const totalEquity = equityBalances.equity.totalEquity;
    const profitMargin = revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0;
    const grossMargin = revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0;
    const ebitdaMargin =
      revenue > 0 ? Math.round((ebitda / revenue) * 1000) / 10 : 0;
    const operatingMargin =
      revenue > 0 ? Math.round((ebit / revenue) * 1000) / 10 : 0;
    const returnOnEquity =
      totalEquity > 0 ? Math.round((netProfit / totalEquity) * 1000) / 10 : null;
    const revenueGrowth =
      prevRevenue > 0
        ? Math.round(((revenue - prevRevenue) / prevRevenue) * 1000) / 10
        : 0;

    const byCat = new Map<string, number>();
    for (const e of expenses) {
      const key = e.category?.trim() || "Other Operating";
      byCat.set(key, (byCat.get(key) ?? 0) + n(e.totalAmount));
    }

    return {
      year: y,
      summary: {
        healthScore: healthScoreResult.score,
        revenue,
        expenses: expenseTotal,
        netProfit,
        profitMargin,
        revenueGrowth,
      },
      keyMetrics: [
        {
          label: "Gross Margin",
          value: `${grossMargin}%`,
          trend: grossMargin >= 40 ? "up" : "stable",
          delta: `${grossMargin >= 40 ? "+" : ""}${grossMargin}%`,
        },
        {
          label: "Operating Margin",
          value: `${operatingMargin}%`,
          trend: operatingMargin >= 0 ? "up" : "down",
          delta: `${operatingMargin}%`,
        },
        {
          label: "EBITDA Margin",
          value: `${ebitdaMargin}%`,
          trend: ebitdaMargin >= 0 ? "up" : "down",
          delta: `${ebitdaMargin}%`,
        },
        {
          label: "Return on Equity",
          value: returnOnEquity == null ? "n/a" : `${returnOnEquity}%`,
          trend:
            returnOnEquity == null ? "stable" : returnOnEquity >= 0 ? "up" : "down",
          delta:
            returnOnEquity == null
              ? "Equity is 0 at year end"
              : `${returnOnEquity}%`,
        },
      ],
      breakdown: {
        revenue,
        costOfSales,
        grossProfit,
        operatingExpenses,
        salaries,
        otherOperatingExpenses,
        ebitda,
        depreciationAmortisation,
        ebit,
        interestExpense,
        taxExpense,
        citRate,
        netProfit,
      },
      costStructure: [...byCat.entries()]
        .map(([category, amount]) => ({
          category,
          amount: round(amount),
          percent: revenue > 0 ? Math.round((amount / revenue) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.amount - a.amount),
      taxgptInsights: [
        {
          type: "insight" as const,
          text: `Gross margin of ${grossMargin}% is computed from recorded sales and cost of sales. Estimated tax of ₦${taxExpense.toLocaleString("en-NG")} uses the client's CIT rate of ${citRate}% on profit after interest.`,
        },
      ],
    };
  },

  async simulateProfitability(
    clientUserId: string,
    body: {
      baselinePeriod?: string;
      adjustments?: Array<{
        lineItem?: string;
        changeType?: string;
        value?: number;
      }>;
    },
  ) {
    const year = body.baselinePeriod
      ? Number(String(body.baselinePeriod).slice(0, 4))
      : new Date().getFullYear();
    const base = await this.profitabilityOverview(clientUserId, year);
    const b = base.breakdown;
    const baseline = new Map<string, number>([
      ["Revenue", b.revenue],
      ["Cost of Sales", b.costOfSales],
      ["Operating Expenses", b.otherOperatingExpenses],
      ["Depreciation & Amortisation", b.depreciationAmortisation],
      ["Interest", b.interestExpense],
      ["Tax", b.taxExpense],
    ]);
    const lines = new Map<string, number>(baseline);

    for (const adj of body.adjustments ?? []) {
      const name = adj.lineItem?.trim();
      if (!name || !lines.has(name)) continue;
      const current = lines.get(name)!;
      const value = Number(adj.value ?? 0);
      const next =
        adj.changeType === "percentage"
          ? current * (1 + value / 100)
          : current + value;
      lines.set(name, next);
    }

    const revenue = lines.get("Revenue") ?? 0;
    const costs = [...lines.entries()]
      .filter(([name]) => name !== "Revenue")
      .reduce((s, [, v]) => s + v, 0);
    const projectedNetProfit = round(revenue - costs);
    const baselineNetProfit = b.netProfit;
    const delta = projectedNetProfit - baselineNetProfit;

    return {
      baselineNetProfit,
      projectedNetProfit,
      delta,
      deltaPercent:
        baselineNetProfit !== 0
          ? Math.round((delta / Math.abs(baselineNetProfit)) * 1000) / 10
          : 0,
      projectedMargin:
        revenue > 0 ? Math.round((projectedNetProfit / revenue) * 1000) / 10 : 0,
      lineItems: [...lines.entries()]
        .map(([name, projected]) => ({
          name,
          baseline: round(baseline.get(name) ?? 0),
          projected: round(projected),
        }))
        .concat([
          {
            name: "Net Profit",
            baseline: baselineNetProfit,
            projected: projectedNetProfit,
          },
        ]),
    };
  },

  async filingSteps(clientUserId: string, filingId: string) {
    const filing = await prisma.taxPayable.findFirst({
      where: { id: filingId, userId: clientUserId },
    });
    if (!filing) return null;

    const stored = await prisma.enterpriseFilingPreparationStep.findMany({
      where: { filingId, clientUserId },
    });
    const byId = new Map(stored.map((row) => [row.stepId, row]));
    const steps = FILING_STEPS.map((name, index) => {
      const id = index + 1;
      const row = byId.get(id);
      return {
        id,
        name,
        status: row?.status ?? "pending",
        completedAt: row?.completedAt?.toISOString() ?? null,
        completedBy: row?.completedBy ?? null,
        note: row?.note ?? null,
        fileUrl: row?.fileUrl ?? null,
      };
    });
    const complete = steps.filter((s) => s.status === "complete").length;
    return {
      steps,
      overallProgress: Math.round((complete / steps.length) * 100),
    };
  },

  async updateFilingStep(
    clientUserId: string,
    filingId: string,
    stepId: number,
    body: { status?: string; note?: string; fileUrl?: string },
    completedBy: string,
  ) {
    const filing = await prisma.taxPayable.findFirst({
      where: { id: filingId, userId: clientUserId },
    });
    if (!filing) return null;
    if (!Number.isInteger(stepId) || stepId < 1 || stepId > 9) {
      throw new HttpReplyError(400, "stepId must be 1–9");
    }
    const status = body.status === "complete" ? "complete" : "in_progress";
    const row = await prisma.enterpriseFilingPreparationStep.upsert({
      where: { filingId_stepId: { filingId, stepId } },
      create: {
        filingId,
        clientUserId,
        stepId,
        status,
        note: body.note ?? null,
        fileUrl: body.fileUrl ?? null,
        completedAt: status === "complete" ? new Date() : null,
        completedBy: status === "complete" ? completedBy : null,
      },
      update: {
        status,
        note: body.note ?? null,
        fileUrl: body.fileUrl ?? null,
        completedAt: status === "complete" ? new Date() : null,
        completedBy: status === "complete" ? completedBy : null,
      },
    });
    return {
      id: row.stepId,
      name: FILING_STEPS[row.stepId - 1],
      status: row.status,
      note: row.note,
      fileUrl: row.fileUrl,
      completedAt: row.completedAt?.toISOString() ?? null,
      completedBy: row.completedBy,
    };
  },

  /**
   * Classifies sales and expenses linked to a Bank-Statement-Analysis
   * Evidence Vault document. Returns null when that document does not exist.
   * Unlinked analyses classify nothing: totals are zero.
   */
  async classifyBankStatement(clientUserId: string, analysisId: string) {
    const analysis = await prisma.evidenceVaultDocument.findFirst({
      where: {
        userId: clientUserId,
        category: "Bank-Statement-Analysis",
        OR: [
          { id: analysisId },
          { documentId: analysisId },
          { evidenceVaultId: analysisId },
          { linkedRecordDocumentId: analysisId },
        ],
      },
      select: {
        id: true,
        documentId: true,
        evidenceVaultId: true,
        documentUrl: true,
        linkedRecord: true,
        name: true,
        date: true,
      },
    });
    if (!analysis) return null;

    const vaultIds = [
      analysis.id,
      analysis.documentId,
      analysis.evidenceVaultId,
    ].filter((id): id is string => Boolean(id));
    const linkedSaleId = analysis.linkedRecord?.startsWith("sale-")
      ? analysis.linkedRecord.slice("sale-".length)
      : null;
    const linkedExpenseId = analysis.linkedRecord?.startsWith("expense-")
      ? analysis.linkedRecord.slice("expense-".length)
      : null;

    const expenseMatch = [
      ...(analysis.documentUrl ? [{ receiptUrl: analysis.documentUrl }] : []),
      ...(linkedExpenseId ? [{ id: linkedExpenseId }] : []),
    ];
    const [sales, expenses] = await Promise.all([
      prisma.sale.findMany({
        where: {
          userId: clientUserId,
          undoAt: null,
          OR: [
            { evidenceVaultId: { in: vaultIds } },
            ...(linkedSaleId ? [{ id: linkedSaleId }] : []),
          ],
        },
        select: { id: true, category: true, totalAmount: true },
      }),
      expenseMatch.length === 0
        ? Promise.resolve([])
        : prisma.expense.findMany({
            where: {
              userId: clientUserId,
              undoAt: null,
              OR: expenseMatch,
            },
            select: {
              id: true,
              category: true,
              expenseType: true,
              totalAmount: true,
            },
          }),
    ]);

    const categorySplit: Record<string, number> = {};
    const add = (category: string, amount: number) => {
      categorySplit[category] = round((categorySplit[category] ?? 0) + amount);
    };
    let totalInflows = 0;
    for (const sale of sales) {
      const amount = round(n(sale.totalAmount));
      totalInflows += amount;
      add(sale.category?.trim() || "Sales Revenue", amount);
    }
    let totalOutflows = 0;
    for (const expense of expenses) {
      const amount = round(n(expense.totalAmount));
      totalOutflows += amount;
      const category =
        expense.expenseType === "COGS"
          ? "Cost of sales"
          : expense.expenseType === "CAPEX"
            ? "Capital expenditure"
            : expense.expenseType === "Tax"
              ? "Tax"
              : expense.category?.trim() || "Operating expenses";
      add(category, amount);
    }

    return {
      analysisId,
      status: "complete" as const,
      analysis: {
        id: analysis.id,
        documentId: analysis.documentId,
        name: analysis.name,
        date: analysis.date.toISOString().slice(0, 10),
      },
      summary: {
        totalInflows,
        totalOutflows,
        netCashflow: totalInflows - totalOutflows,
        transactionCount: sales.length + expenses.length,
        categorySplit,
      },
      message:
        sales.length + expenses.length === 0
          ? "No sales or expenses are linked to this analysis."
          : "Classified from sales and expenses linked to this analysis.",
    };
  },
};
