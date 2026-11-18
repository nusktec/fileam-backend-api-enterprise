import { prisma } from "../../../config/database";
import { PERCENT } from "../../../constants/percentages";
import { decimalToNumber } from "../utils";

export type TaxOptimizeStrategy = {
  id: string;
  title: string;
  estimatedSaving: number;
};

export const featuresTaxOptimizerService = {
  async getSnapshot(clientUserId: string, year?: number) {
    const y = year && Number.isFinite(year) ? year : new Date().getUTCFullYear();
    const start = new Date(Date.UTC(y, 0, 1));
    const end = new Date(Date.UTC(y, 11, 31));

    const [sales, expenses, assumptions, taxPayables] = await Promise.all([
      prisma.sale.findMany({
        where: {
          userId: clientUserId,
          undoAt: null,
          saleDate: { gte: start, lte: end },
        },
        select: { totalAmount: true, vatAmount: true },
      }),
      prisma.expense.findMany({
        where: {
          userId: clientUserId,
          undoAt: null,
          expenseDate: { gte: start, lte: end },
        },
        select: { totalAmount: true, isDeductible: true },
      }),
      prisma.clientTaxAssumptions.findUnique({ where: { clientUserId } }),
      prisma.taxPayable.findMany({
        where: { userId: clientUserId },
        select: { totalPayable: true, taxType: true },
      }).catch(() => [] as Array<{ totalPayable: unknown; taxType: string }>),
    ]);

    const annualRevenue = sales.reduce(
      (s, r) => s + decimalToNumber(r.totalAmount),
      0,
    );
    const annualExpenses = expenses.reduce(
      (s, r) => s + decimalToNumber(r.totalAmount),
      0,
    );

    const citRatePercent = assumptions?.applicationCitRate ?? 30;
    const citRate = citRatePercent / PERCENT;
    const deductibleExpenses = expenses
      .filter((e) => e.isDeductible)
      .reduce((s, e) => s + decimalToNumber(e.totalAmount), 0);
    const taxableProfit = Math.max(0, annualRevenue - deductibleExpenses);
    const computedTax = Math.round(taxableProfit * citRate);
    const filedTax = taxPayables
      .filter((t) => t.taxType === "CIT")
      .reduce((s, t) => s + decimalToNumber(t.totalPayable), 0);
    const currentTaxLiability = filedTax > 0 ? Math.round(filedTax) : computedTax;

    const strategies: TaxOptimizeStrategy[] = [];
    if (assumptions?.msmeExemptionEligible && currentTaxLiability > 0) {
      strategies.push({
        id: "msme",
        title: "MSME exemption",
        estimatedSaving: currentTaxLiability,
      });
    }

    const potentialSavings = strategies.reduce(
      (s, strategy) => s + strategy.estimatedSaving,
      0,
    );
    const newTaxLiability = Math.max(0, currentTaxLiability - potentialSavings);

    return {
      annualRevenue: Math.round(annualRevenue),
      annualExpenses: Math.round(annualExpenses),
      deductibleExpenses: Math.round(deductibleExpenses),
      citRate: citRatePercent,
      currentTaxLiability,
      potentialSavings,
      newTaxLiability,
      totalStrategies: strategies.length,
      strategies,
    };
  },
};
