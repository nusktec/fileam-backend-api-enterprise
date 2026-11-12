import { prisma } from "../../../config/database";
import { decimalToNumber } from "../utils";

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

    const citRate = (assumptions?.applicationCitRate ?? 30) / 100;
    const taxableProfit = Math.max(0, annualRevenue - annualExpenses);
    let currentTaxLiability = taxPayables.reduce(
      (s, t) => s + decimalToNumber(t.totalPayable),
      0,
    );
    if (currentTaxLiability <= 0) {
      currentTaxLiability = Math.round(taxableProfit * citRate);
    }

    const deductibleExpenses = expenses
      .filter((e) => e.isDeductible)
      .reduce((s, e) => s + decimalToNumber(e.totalAmount), 0);
    const strategies: string[] = [];
    if (assumptions?.msmeExemptionEligible) strategies.push("msme");
    if (deductibleExpenses > 0) strategies.push("deductions");
    if ((assumptions?.vatRegistrationStatus ?? "not-registered") !== "registered") {
      strategies.push("vat-timing");
    }
    if (citRate > 0.2) strategies.push("cit-rate");
    if (annualExpenses / Math.max(annualRevenue, 1) > 0.5) {
      strategies.push("expense-reclass");
    }

    const potentialSavings = Math.round(
      currentTaxLiability * Math.min(0.35, 0.05 * Math.max(strategies.length, 1)),
    );
    const newTaxLiability = Math.max(0, currentTaxLiability - potentialSavings);

    return {
      annualRevenue: Math.round(annualRevenue),
      annualExpenses: Math.round(annualExpenses),
      currentTaxLiability: Math.round(currentTaxLiability),
      potentialSavings,
      newTaxLiability,
      totalStrategies: Math.max(strategies.length, 1),
    };
  },
};
