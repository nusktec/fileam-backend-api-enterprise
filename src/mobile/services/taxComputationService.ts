import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import {
  PERCENT,
  WHT_RATE_SERVICES_PERCENT,
  CIT_RATE_SMALL_COMPANY_PERCENT,
  VAT_TURNOVER_THRESHOLD_NGN,
  CIT_PROFIT_THRESHOLD_NGN,
} from "../../constants/percentages";

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
    const estimatedWhtDeducted =
      (serviceIncome * WHT_RATE_SERVICES_PERCENT) / PERCENT;
    const monthlyProfit = netProfit;
    const annualizedProfit = monthlyProfit * 12;
    const estimatedAnnualCit =
      (annualizedProfit * CIT_RATE_SMALL_COMPANY_PERCENT) / PERCENT;

    const percentOfVatThreshold =
      (totalIncome / VAT_TURNOVER_THRESHOLD_NGN) * PERCENT;
    const amountNeededToVatThreshold = Math.max(
      0,
      VAT_TURNOVER_THRESHOLD_NGN - totalIncome,
    );
    const percentOfCitThreshold =
      (annualizedProfit / CIT_PROFIT_THRESHOLD_NGN) * PERCENT;

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
        belowThreshold: totalIncome < VAT_TURNOVER_THRESHOLD_NGN,
        income: totalIncome,
        vatThreshold: VAT_TURNOVER_THRESHOLD_NGN,
        percentOfThreshold: percentOfVatThreshold,
        amountNeededToThreshold: amountNeededToVatThreshold,
        outputVat,
        inputVatClaimable,
        netVatPayable,
      },
      wht: {
        summary: estimatedWhtDeducted,
        serviceIncome,
        whtRateServices: WHT_RATE_SERVICES_PERCENT,
        estimatedWhtDeducted,
      },
      cit: {
        summary: estimatedAnnualCit,
        smallCompanyRate: CIT_RATE_SMALL_COMPANY_PERCENT,
        citThreshold: CIT_PROFIT_THRESHOLD_NGN,
        percentOfThreshold: percentOfCitThreshold,
        monthlyProfit,
        annualizedProfit,
        citRate: CIT_RATE_SMALL_COMPANY_PERCENT,
        estimatedAnnualCit,
        /** Placeholder until book records track allowances; 0 means not supplied in-app. */
        capitalAllowances: 0,
        /** Loss brought forward applied before tax (not tracked in-app; 0 = none). */
        lossCarryForward: 0,
      },
    };
  },
};
