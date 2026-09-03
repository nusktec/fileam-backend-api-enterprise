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
import {
  computeLegacyPayeMonthlyFromProfileGross,
} from "../../constants/payroll";
import { computeTotalMonthlyPayeForUser } from "./employeesService";
import { buildTaxPersonaGuidancePayload } from "../../constants/taxPersona";
import { ASSET_ON_BOOKS_STATUSES } from "../../constants/assets";
import { VAT_CLASSIFICATION } from "../../constants/taxEligibility";
import { monthDateRangeUtc } from "../../utils/dateRangeQuery";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { buildTaxEligibilityProfileForUser } from "./taxEligibilityService";
import {
  monthsInTaxRange,
  taxPeriodLabel,
  type TaxPeriodRange,
} from "../../utils/taxPeriodQuery";

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

    let payeMonthlyEstimate = 0;
    let payeDerivedFrom: "employees" | "profile_gross" | "none" = "none";
    if (flags.paye) {
      const employeePaye = await computeTotalMonthlyPayeForUser(
        userId,
        `${year}-${String(month).padStart(2, "0")}`,
      );
      if (employeePaye > 0) {
        payeMonthlyEstimate = employeePaye;
        payeDerivedFrom = "employees";
      } else if (salaryMonthlyCaptured > 0) {
        payeMonthlyEstimate = computeLegacyPayeMonthlyFromProfileGross(
          salaryMonthlyCaptured,
        );
        payeDerivedFrom = "profile_gross";
      }
    }
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
        range: "month" as TaxPeriodRange,
        monthsIncluded: 1,
        label: taxPeriodLabel(year, month, "month"),
      },
      overview: {
        totalIncome,
        totalExpenses,
        netProfit,
      },
      vat: {
        summary: normalizeMoneyAmount(netVatPayable),
        periodAmount: normalizeMoneyAmount(netVatPayable),
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
        periodAmount: estimatedWhtDeducted,
        serviceIncome,
        whtRateServices: WHT_RATE_SERVICES_PERCENT,
        estimatedWhtDeducted,
      },
      cit: {
        summary: normalizeMoneyAmount(citEstimate.totalCitLiability),
        periodAmount: normalizeMoneyAmount(citEstimate.totalCitLiability / 12),
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
        periodAmount: pitFromBooks.estimatedAnnualPitNgn / 12,
        monthlyProfit,
        annualizedProfit,
        chargeableIncomeProxyAnnual: pitFromBooks.chargeableIncomeProxyAnnualNgn,
        estimatedAnnualPit: pitFromBooks.estimatedAnnualPitNgn,
        methodology: pitFromBooks.methodology,
      },
      /**
       * PAYE (Pay As You Earn) — Universal Nigeria PAYE Formula 2026.
       * Primary: sum of employee payroll records. Legacy fallback: profile gross monthly.
       */
      paye: {
        applicable: flags.paye,
        derivedFrom: payeDerivedFrom,
        employmentGrossSalaryMonthlyCaptured:
          salaryMonthlyCaptured > 0 ? salaryMonthlyCaptured : null,
        summaryMonthlyEstimate: payeMonthlyEstimate,
        periodAmount: payeMonthlyEstimate,
        summaryAnnualEstimate: payeAnnualEstimate,
        methodology:
          payeDerivedFrom === "employees"
            ? "PAYE from employee salary components (AGI = 12×[basic+housing+transport+meal+otherAllowances]; pension on basic+housing+transport; NHF 2.5% of basic; NHIS/life/mortgage monthly×12; rent relief min(20%×annual rent, ₦500k); progressive 2026 bands). Only employees active in this period are included."
            : payeDerivedFrom === "profile_gross"
              ? "Legacy profile gross only — add Employees with full salary breakdown for strict PDF PAYE. Approximate: treats profile gross as basic for pension/NHF."
              : flags.paye
                ? "PAYE applies — add Employees (recommended) or optional employmentGrossSalaryMonthly on profile for a legacy estimate."
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

  /** Period-aware computation for dashboard / payables (month, quarter, or year ending at anchor month). */
  async getForQuery(
    userId: string,
    opts: { year: number; month: number; range?: TaxPeriodRange },
  ) {
    const range = opts.range ?? "month";
    const months = monthsInTaxRange(opts.year, opts.month, range);
    if (months.length === 1) {
      return this.getForPeriod(userId, opts.year, opts.month);
    }

    const results = await Promise.all(
      months.map((m) => this.getForPeriod(userId, m.year, m.month)),
    );
    const anchor = results[results.length - 1]!;
    const sum = (pick: (c: (typeof results)[number]) => number) =>
      results.reduce((total, c) => total + pick(c), 0);

    const payeMonthlyTotal = sum((c) => c.paye.summaryMonthlyEstimate);
    const payeDerivedFrom = results.some((c) => c.paye.derivedFrom === "employees")
      ? ("employees" as const)
      : results.some((c) => c.paye.derivedFrom === "profile_gross")
        ? ("profile_gross" as const)
        : ("none" as const);

    const annualizationFactor = 12 / months.length;

    return {
      taxpayerContext: anchor.taxpayerContext,
      taxPersonaGuidance: anchor.taxPersonaGuidance,
      period: {
        year: opts.year,
        month: opts.month,
        range,
        monthsIncluded: months.length,
        label: taxPeriodLabel(opts.year, opts.month, range),
      },
      overview: {
        totalIncome: sum((c) => c.overview.totalIncome),
        totalExpenses: sum((c) => c.overview.totalExpenses),
        netProfit: sum((c) => c.overview.netProfit),
      },
      vat: {
        ...anchor.vat,
        summary: normalizeMoneyAmount(sum((c) => c.vat.netVatPayable)),
        periodAmount: normalizeMoneyAmount(sum((c) => c.vat.netVatPayable)),
        income: normalizeMoneyAmount(sum((c) => c.vat.income)),
        outputVat: normalizeMoneyAmount(sum((c) => c.vat.outputVat)),
        inputVatClaimable: normalizeMoneyAmount(
          sum((c) => c.vat.inputVatClaimable),
        ),
        netVatPayable: normalizeMoneyAmount(sum((c) => c.vat.netVatPayable)),
        belowThreshold: results.every((c) => c.vat.belowThreshold),
      },
      wht: {
        summary: sum((c) => c.wht.estimatedWhtDeducted),
        periodAmount: sum((c) => c.wht.estimatedWhtDeducted),
        serviceIncome: sum((c) => c.wht.serviceIncome),
        whtRateServices: anchor.wht.whtRateServices,
        estimatedWhtDeducted: sum((c) => c.wht.estimatedWhtDeducted),
      },
      cit: {
        ...anchor.cit,
        summary: normalizeMoneyAmount(
          sum((c) => c.cit.totalCitLiability / 12),
        ),
        periodAmount: normalizeMoneyAmount(
          sum((c) => c.cit.totalCitLiability / 12),
        ),
        monthlyProfit: sum((c) => c.cit.monthlyProfit),
        annualizedProfit: sum((c) => c.cit.monthlyProfit) * annualizationFactor,
        annualizedTurnover:
          sum((c) => c.vat.income) * annualizationFactor,
      },
      pit: {
        ...anchor.pit,
        summary: sum((c) => c.pit.summary / 12),
        periodAmount: sum((c) => c.pit.summary / 12),
        monthlyProfit: sum((c) => c.pit.monthlyProfit),
        annualizedProfit: sum((c) => c.pit.monthlyProfit) * annualizationFactor,
        estimatedAnnualPit:
          sum((c) => c.pit.summary / 12) * annualizationFactor,
      },
      paye: {
        ...anchor.paye,
        derivedFrom: payeDerivedFrom,
        summaryMonthlyEstimate: payeMonthlyTotal,
        periodAmount: payeMonthlyTotal,
        summaryAnnualEstimate: payeMonthlyTotal * annualizationFactor,
      },
      localGovLevies: anchor.localGovLevies,
    };
  },
};
