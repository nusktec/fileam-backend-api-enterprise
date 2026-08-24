import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import {
  PERCENT,
  WHT_RATE_SERVICES_PERCENT,
  CIT_RATE_SMALL_COMPANY_PERCENT,
  CIT_RATE_STANDARD_PERCENT,
  VAT_TURNOVER_THRESHOLD_NGN,
  CIT_TURNOVER_THRESHOLD_NGN,
} from "../../constants/percentages";
import { resolveTaxpayerComputationContext } from "../../constants/taxpayerComputationProfile";
import { estimateAnnualPersonalIncomeTaxNg } from "../../constants/pitComputation";
import { computePayeMonthly } from "../../constants/payroll";
import { buildTaxPersonaGuidancePayload } from "../../constants/taxPersona";
import { monthDateRangeUtc } from "../../utils/dateRangeQuery";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

export const taxComputationService = {
  /** Shared context for tax computation, payables, and dashboard copy (persona-aware). */
  async getPersonaPayloadForUser(userId: string) {
    const onboarding = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        roleDescription: true,
        purpose: true,
        organizationName: true,
        taxPersona: true,
        solopreneurRegistration: true,
        employmentGrossSalaryMonthly: true,
        businesses: {
          take: 1,
          orderBy: { updatedAt: "desc" },
          select: { businessType: true, incomeType: true },
        },
      },
    });
    const b = onboarding?.businesses?.[0];
    const taxpayerContext = resolveTaxpayerComputationContext({
      roleDescription: onboarding?.roleDescription,
      purpose: onboarding?.purpose,
      organizationName: onboarding?.organizationName,
      businessType: b?.businessType,
      incomeType: b?.incomeType,
      taxPersona: onboarding?.taxPersona,
      solopreneurRegistration: onboarding?.solopreneurRegistration,
    });
    const taxPersonaGuidance = buildTaxPersonaGuidancePayload(
      onboarding?.taxPersona,
      onboarding?.solopreneurRegistration,
    );
    const employmentGrossSalaryMonthly =
      onboarding?.employmentGrossSalaryMonthly != null
        ? decimalToNumber(onboarding.employmentGrossSalaryMonthly)
        : null;
    return {
      taxpayerContext,
      taxPersonaGuidance,
      employmentGrossSalaryMonthly,
    };
  },

  async getForPeriod(userId: string, year: number, month: number) {
    const { start, end } = monthDateRangeUtc(year, month);

    const [sales, expenses, personaPayload] = await Promise.all([
      prisma.sale.findMany({
        where: { userId, saleDate: { gte: start, lte: end } },
      }),
      prisma.expense.findMany({
        where: { userId, expenseDate: { gte: start, lte: end } },
      }),
      this.getPersonaPayloadForUser(userId),
    ]);

    const { taxpayerContext, taxPersonaGuidance, employmentGrossSalaryMonthly } =
      personaPayload;

    const salaryMonthlyCaptured =
      employmentGrossSalaryMonthly != null && employmentGrossSalaryMonthly > 0
        ? employmentGrossSalaryMonthly
        : 0;

    const totalIncome = sales.reduce(
      (s, x) => s + decimalToNumber(x.amount),
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
      (s, x) => s + decimalToNumber(x.amount),
      0,
    );
    /** Input VAT only from VAT-tagged expenses (stored vatAmount). */
    const inputVatClaimable = expenses.reduce((s, x) => {
      if (!x.vatInclusive || x.vatAmount == null) return s;
      return s + decimalToNumber(x.vatAmount);
    }, 0);
    const netProfit = totalIncome - totalExpenses;

    /** Net VAT Payable = Output VAT − Input VAT (claimable). */
    const netVatPayable = outputVat - inputVatClaimable;
    const estimatedWhtDeducted =
      (serviceIncome * WHT_RATE_SERVICES_PERCENT) / PERCENT;
    const monthlyProfit = netProfit;
    const annualizedProfit = monthlyProfit * 12;
    const annualizedTurnover = totalIncome * 12;
    const citSmallCompanyProxy =
      annualizedTurnover <= CIT_TURNOVER_THRESHOLD_NGN;
    const citRateDisplay = citSmallCompanyProxy
      ? CIT_RATE_SMALL_COMPANY_PERCENT
      : CIT_RATE_STANDARD_PERCENT;
    const estimatedAnnualCit = citSmallCompanyProxy
      ? 0
      : Math.round(
          (Math.max(0, annualizedProfit) * CIT_RATE_STANDARD_PERCENT) / PERCENT,
        );

    const pitFromBooks = estimateAnnualPersonalIncomeTaxNg(
      Math.max(0, annualizedProfit),
    );

    const flags = taxPersonaGuidance.applicableTaxes;

    const employmentGrossAnnual = salaryMonthlyCaptured * 12;
    const payeMonthlyEstimate =
      flags.paye && employmentGrossAnnual > 0
        ? computePayeMonthly(employmentGrossAnnual)
        : 0;
    const payeAnnualEstimate = payeMonthlyEstimate * 12;

    const percentOfVatThreshold =
      (totalIncome / VAT_TURNOVER_THRESHOLD_NGN) * PERCENT;
    const amountNeededToVatThreshold = Math.max(
      0,
      VAT_TURNOVER_THRESHOLD_NGN - totalIncome,
    );
    const percentOfCitThreshold =
      (annualizedTurnover / CIT_TURNOVER_THRESHOLD_NGN) * PERCENT;

    return {
      taxpayerContext,
      taxPersonaGuidance,
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
        summary: normalizeMoneyAmount(netVatPayable),
        belowThreshold: totalIncome < VAT_TURNOVER_THRESHOLD_NGN,
        income: normalizeMoneyAmount(totalIncome),
        vatThreshold: VAT_TURNOVER_THRESHOLD_NGN,
        percentOfThreshold: percentOfVatThreshold,
        amountNeededToThreshold: amountNeededToVatThreshold,
        outputVat: normalizeMoneyAmount(outputVat),
        inputVatClaimable: normalizeMoneyAmount(inputVatClaimable),
        netVatPayable: normalizeMoneyAmount(netVatPayable),
      },
      wht: {
        summary: estimatedWhtDeducted,
        serviceIncome,
        whtRateServices: WHT_RATE_SERVICES_PERCENT,
        estimatedWhtDeducted,
      },
      cit: {
        summary: normalizeMoneyAmount(estimatedAnnualCit),
        smallCompanyRate: CIT_RATE_SMALL_COMPANY_PERCENT,
        citThreshold: CIT_TURNOVER_THRESHOLD_NGN,
        percentOfThreshold: percentOfCitThreshold,
        monthlyProfit,
        annualizedProfit,
        citRate: citRateDisplay,
        estimatedAnnualCit,
        /** Placeholder until book records track allowances; 0 means not supplied in-app. */
        capitalAllowances: 0,
        /** Loss brought forward applied before tax (not tracked in-app; 0 = none). */
        lossCarryForward: 0,
      },
      pit: {
        summary: pitFromBooks.estimatedAnnualPitNgn,
        monthlyProfit,
        annualizedProfit,
        chargeableIncomeProxyAnnual: pitFromBooks.chargeableIncomeProxyAnnualNgn,
        estimatedAnnualPit: pitFromBooks.estimatedAnnualPitNgn,
        methodology: pitFromBooks.methodology,
      },
      /**
       * PAYE (Pay As You Earn) — salary withholding. Distinct from tax persona **PAYEE**.
       * Uses `User.employmentGrossSalaryMonthly` (NGN) when PAYE is persona-applicable.
       */
      paye: {
        applicable: flags.paye,
        employmentGrossSalaryMonthlyCaptured:
          salaryMonthlyCaptured > 0 ? salaryMonthlyCaptured : null,
        summaryMonthlyEstimate: payeMonthlyEstimate,
        summaryAnnualEstimate: payeAnnualEstimate,
        methodology:
          flags.paye && salaryMonthlyCaptured > 0
            ? "Estimated PAYE using Nigeria NRS progressive bands (first ₦800,000 tax-free on chargeable income, then 15%/18%/21%/23%/25%) after consolidated relief, employee pension, and optional statutory reliefs. Employers withhold differently — reconcile with payslips. Freelance/side income remains under WHT / PIT."
            : flags.paye && salaryMonthlyCaptured <= 0
              ? "PAYE applies to salary — set employmentGrossSalaryMonthly on your mobile profile to populate estimates."
              : "PAYE mainly applies when your tax persona is PAYEE (employee + side income).",
      },
      /** Placeholder until local levy amounts are modeled from location/trade data. */
      localGovLevies: {
        applicable: flags.localGovLevies,
        summaryMonthlyEstimate: 0,
        methodology: flags.localGovLevies
          ? "Local/trade levies vary by state and LGA; amounts are not estimated from books in this release."
          : "Not emphasized for your current tax persona.",
      },
    };
  },
};
