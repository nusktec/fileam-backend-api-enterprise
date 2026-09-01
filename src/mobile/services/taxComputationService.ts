import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import {
  PERCENT,
  WHT_RATE_SERVICES_PERCENT,
  VAT_TURNOVER_THRESHOLD_NGN,
  CIT_TURNOVER_THRESHOLD_NGN,
} from "../../constants/percentages";
import { estimateCitFromBooks } from "../../constants/citFiling";
import { resolveTaxpayerComputationContext } from "../../constants/taxpayerComputationProfile";
import { estimateAnnualPersonalIncomeTaxNg } from "../../constants/pitComputation";
import { computePayeMonthly } from "../../constants/payroll";
import { buildTaxPersonaGuidancePayload } from "../../constants/taxPersona";
import { ASSET_ON_BOOKS_STATUSES } from "../../constants/assets";
import { VAT_CLASSIFICATION } from "../../constants/taxEligibility";
import { monthDateRangeUtc } from "../../utils/dateRangeQuery";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { buildTaxEligibilityProfileForUser } from "./taxEligibilityService";

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

    const [sales, expenses, personaPayload, business, fixedAssetRows, taxProfile] =
      await Promise.all([
      prisma.sale.findMany({
        where: { userId, saleDate: { gte: start, lte: end } },
      }),
      prisma.expense.findMany({
        where: { userId, expenseDate: { gte: start, lte: end } },
      }),
      this.getPersonaPayloadForUser(userId),
      prisma.business.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { businessType: true, sector: true },
      }),
      prisma.asset.findMany({
        where: { userId, status: { in: [...ASSET_ON_BOOKS_STATUSES] } },
        select: { purchaseCost: true },
      }),
      buildTaxEligibilityProfileForUser(userId),
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
    const fixedAssetsProxy = taxProfile?.taxEligibility.inputs.totalFixedAssets ??
      fixedAssetRows.reduce(
        (s, a) => s + decimalToNumber(a.purchaseCost),
        0,
      );
    const eligibilityTurnover =
      taxProfile?.taxEligibility.inputs.annualGrossTurnover ?? annualizedTurnover;
    const providesProfessional =
      taxProfile?.taxEligibility.inputs.providesProfessionalServicesResolved;
    const citEstimate = estimateCitFromBooks({
      annualizedTurnover: eligibilityTurnover,
      annualizedProfit,
      fixedAssets: fixedAssetsProxy,
      businessType: business?.businessType,
      sector: business?.sector,
      providesProfessionalServices: providesProfessional,
    });

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
      (eligibilityTurnover / CIT_TURNOVER_THRESHOLD_NGN) * PERCENT;
    const vatBelowThreshold =
      taxProfile?.taxEligibility.vatClassification ===
      VAT_CLASSIFICATION.SMALL_BUSINESS
        ? true
        : taxProfile?.taxEligibility.vatClassification ===
            VAT_CLASSIFICATION.NON_SMALL_BUSINESS
          ? false
          : totalIncome < VAT_TURNOVER_THRESHOLD_NGN;

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
        belowThreshold: vatBelowThreshold,
        vatClassification: taxProfile?.taxEligibility.vatClassification ?? null,
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
        summary: normalizeMoneyAmount(citEstimate.totalCitLiability),
        isSmallCompany: citEstimate.isSmallCompany,
        citClassification: taxProfile?.taxEligibility.citClassification ?? null,
        taxClassLabel: citEstimate.taxClassLabel,
        citThreshold: CIT_TURNOVER_THRESHOLD_NGN,
        percentOfThreshold: percentOfCitThreshold,
        monthlyProfit,
        annualizedProfit,
        annualizedTurnover: eligibilityTurnover,
        fixedAssetsProxy,
        citRate: citEstimate.citRate,
        levyRate: citEstimate.levyRate,
        estimatedAnnualCit: citEstimate.estimatedAnnualCit,
        developmentLevy: citEstimate.developmentLevy,
        totalCitLiability: citEstimate.totalCitLiability,
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
            ? "Estimated PAYE under NTA 2025 (effective 1 Jan 2026): progressive bands (first ₦800,000 tax-free on chargeable income, then 15%/18%/21%/23%/25%) after employee pension (8% of gross). Consolidated Relief Allowance (CRA) abolished — use employee rent relief (min(20% × annual rent, ₦500,000)) via payroll records. NHF not included here unless basic salary is captured separately on profile. Reconcile with employer payslips."
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
