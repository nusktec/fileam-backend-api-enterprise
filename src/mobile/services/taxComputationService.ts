import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";

const VAT_RATE = 7.5;
const WHT_RATE_SERVICES = 5;
const CIT_RATE_SMALL = 20;
const VAT_THRESHOLD = 100_000_000;
const CIT_THRESHOLD = 50_000_000;

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

export const taxComputationService = {
  async getForPeriod(userId: string, year: number, month: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const [sales, expenses] = await Promise.all([
      prisma.sale.findMany({
        where: { userId, saleDate: { gte: start, lte: end } },
      }),
      prisma.expense.findMany({
        where: { userId, expenseDate: { gte: start, lte: end } },
      }),
    ]);

    const totalIncome = sales.reduce(
      (s, x) => s + decimalToNumber(x.totalAmount),
      0,
    );
    const outputVat = sales.reduce(
      (s, x) => s + decimalToNumber(x.vatAmount),
      0,
    );
    const serviceIncome = sales
      .filter((x) => x.serviceIncome)
      .reduce((s, x) => s + decimalToNumber(x.amount), 0);
    const totalExpenses = expenses.reduce(
      (s, x) => s + decimalToNumber(x.totalAmount),
      0,
    );
    const inputVatClaimable = expenses.reduce(
      (s, x) => s + decimalToNumber(x.vatAmount),
      0,
    );
    const netProfit = totalIncome - totalExpenses;

    const netVatPayable = outputVat - inputVatClaimable;
    const estimatedWhtDeducted = (serviceIncome * WHT_RATE_SERVICES) / 100;
    const monthlyProfit = netProfit;
    const annualizedProfit = monthlyProfit * 12;
    const estimatedAnnualCit = (annualizedProfit * CIT_RATE_SMALL) / 100;

    const percentOfVatThreshold = (totalIncome / VAT_THRESHOLD) * 100;
    const amountNeededToVatThreshold = Math.max(0, VAT_THRESHOLD - totalIncome);
    const percentOfCitThreshold = (annualizedProfit / CIT_THRESHOLD) * 100;

    return {
      period: {
        year,
        month,
        label: `${new Date(year, month - 1).toLocaleString("default", { month: "long" })} ${year}`,
      },
      overview: {
        totalIncome,
        totalExpenses,
        netProfit,
      },
      vat: {
        summary: netVatPayable,
        belowThreshold: totalIncome < VAT_THRESHOLD,
        income: totalIncome,
        vatThreshold: VAT_THRESHOLD,
        percentOfThreshold: percentOfVatThreshold,
        amountNeededToThreshold: amountNeededToVatThreshold,
        outputVat,
        inputVatClaimable,
        netVatPayable,
      },
      wht: {
        summary: estimatedWhtDeducted,
        serviceIncome,
        whtRateServices: WHT_RATE_SERVICES,
        estimatedWhtDeducted,
      },
      cit: {
        summary: estimatedAnnualCit,
        smallCompanyRate: CIT_RATE_SMALL,
        citThreshold: CIT_THRESHOLD,
        percentOfThreshold: percentOfCitThreshold,
        monthlyProfit,
        annualizedProfit,
        citRate: CIT_RATE_SMALL,
        estimatedAnnualCit,
      },
    };
  },
};
