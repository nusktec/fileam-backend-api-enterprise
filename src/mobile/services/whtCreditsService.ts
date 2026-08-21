import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { RECEIVABLE_TYPES } from "../../constants/receivables";
import { WHT_RATE_SERVICES_PERCENT, PERCENT } from "../../constants/percentages";
import { monthDateRangeUtc } from "../../utils/dateRangeQuery";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { taxComputationService } from "./taxComputationService";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function payloadWhtDeducted(payload: unknown): number {
  if (!payload || typeof payload !== "object") return 0;
  const wht = (payload as { whtDeducted?: unknown }).whtDeducted;
  return normalizeMoneyAmount(Number(wht) || 0);
}

export const whtCreditsService = {
  /**
   * WHT credits owed **to** the business (withheld by payers on the user's income).
   * Distinct from contractor WHT on payroll (/employees/obligations.contractorWht),
   * which is WHT the business withholds when paying contractors.
   */
  async getCredits(
    userId: string,
    year: number,
    month: number,
  ) {
    const { start, end } = monthDateRangeUtc(year, month);
    const periodLabel = `${year}-${String(month).padStart(2, "0")}`;

    const [computation, serviceSales, investmentReceivables] =
      await Promise.all([
        taxComputationService.getForPeriod(userId, year, month),
        prisma.sale.findMany({
          where: {
            userId,
            serviceIncome: true,
            saleDate: { gte: start, lte: end },
          },
          select: {
            id: true,
            invoiceNumber: true,
            description: true,
            amount: true,
            saleDate: true,
            customerName: true,
          },
          orderBy: [{ saleDate: "desc" }, { createdAt: "desc" }],
        }),
        prisma.receivable.findMany({
          where: {
            userId,
            type: RECEIVABLE_TYPES.INVESTMENT_INCOME_OWED,
          },
          select: {
            id: true,
            receivableCode: true,
            partyName: true,
            grossAmount: true,
            payload: true,
            dueDate: true,
          },
        }),
      ]);

    const serviceIncomeEstimated = normalizeMoneyAmount(
      computation.wht.estimatedWhtDeducted,
    );
    const serviceIncomeLines = serviceSales.map((s) => {
      const base = decimalToNumber(s.amount);
      const wht = normalizeMoneyAmount(
        (base * WHT_RATE_SERVICES_PERCENT) / PERCENT,
      );
      return {
        source: "service_sale" as const,
        id: s.id,
        reference: s.invoiceNumber,
        description: s.description,
        customerName: s.customerName,
        date: s.saleDate,
        serviceIncomeBase: base,
        whtRatePercent: WHT_RATE_SERVICES_PERCENT,
        whtCredit: wht,
      };
    });

    const receivableLines = investmentReceivables.flatMap((r) => {
      const wht = payloadWhtDeducted(r.payload);
      if (wht <= 0) return [];
      return [
        {
          source: "investment_receivable" as const,
          id: r.id,
          reference: r.receivableCode,
          partyName: r.partyName,
          grossAmount: decimalToNumber(r.grossAmount),
          whtCredit: wht,
          dueDate: r.dueDate,
        },
      ];
    });

    const receivableWhtTotal = normalizeMoneyAmount(
      receivableLines.reduce((sum, line) => sum + line.whtCredit, 0),
    );

    const totalWhtCredit = normalizeMoneyAmount(
      serviceIncomeEstimated + receivableWhtTotal,
    );

    return {
      period: {
        year,
        month,
        label: periodLabel,
      },
      summary: {
        totalWhtCreditOwedToYou: totalWhtCredit,
        serviceIncomeWhtEstimated: serviceIncomeEstimated,
        investmentReceivableWhtRecorded: receivableWhtTotal,
        whtRateServicesPercent: WHT_RATE_SERVICES_PERCENT,
        note:
          "Credits from clients/customers who withheld WHT on your service income, plus WHT recorded on investment-income receivables. For WHT you withhold when paying contractors, see GET /mobile/employees/obligations (contractorWht).",
      },
      serviceIncome: {
        totalServiceIncome: computation.wht.serviceIncome,
        estimatedWhtCredit: serviceIncomeEstimated,
        lines: serviceIncomeLines,
      },
      investmentReceivables: {
        totalWhtCredit: receivableWhtTotal,
        lines: receivableLines,
      },
      alsoAvailableVia: {
        taxComputation: `/mobile/tax-computation?period=${periodLabel}`,
        taxComputationField: "data.wht.estimatedWhtDeducted",
      },
    };
  },
};
