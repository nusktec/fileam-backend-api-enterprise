import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import {
  PERCENT,
  VAT_RATE_PERCENT,
  WHT_RATE_SERVICES_PERCENT,
  VAT_TURNOVER_THRESHOLD_NGN,
  CIT_TURNOVER_THRESHOLD_NGN,
} from "../../constants/percentages";
import { estimateCitFromBooks } from "../../constants/citFiling";
import { resolveTaxpayerComputationContext } from "../../constants/taxpayerComputationProfile";
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
import { resolveCitClassificationInputsForYear } from "./citClassificationInputsService";
import { getPitAnnualEstimateForYear, getPitMonthlyEstimateFromBooks } from "./pitFilingService";
import {
  monthsInTaxRange,
  taxPeriodLabel,
  type TaxPeriodRange,
} from "../../utils/taxPeriodQuery";
import { liveExpenseWhere, liveSaleWhere } from "../../utils/liveBookQuery";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

type MonthBooks = { income: number; expenses: number; netProfit: number; hasActivity: boolean };

/** Net profit and activity for one calendar month (live books only). */
async function getMonthBooks(
  userId: string,
  year: number,
  month: number,
): Promise<MonthBooks> {
  const { start, end } = monthDateRangeUtc(year, month);
  const dateRange = { gte: start, lte: end };
  const [sales, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: liveSaleWhere(userId, dateRange),
      select: { amount: true },
    }),
    prisma.expense.findMany({
      where: liveExpenseWhere(userId, dateRange),
      select: { amount: true },
    }),
  ]);
  const income = sales.reduce((s, x) => s + decimalToNumber(x.amount), 0);
  const exp = expenses.reduce((s, x) => s + decimalToNumber(x.amount), 0);
  return {
    income: normalizeMoneyAmount(income),
    expenses: normalizeMoneyAmount(exp),
    netProfit: normalizeMoneyAmount(income - exp),
    hasActivity: sales.length > 0 || expenses.length > 0,
  };
}

/**
 * Cumulative net profit for the calendar year: sum of every month that has
 * book activity. Same value regardless of which month the client is viewing.
 */
async function cumulativeYearNetProfitWithActivity(
  userId: string,
  year: number,
): Promise<number> {
  const months = await Promise.all(
    Array.from({ length: 12 }, (_, i) => getMonthBooks(userId, year, i + 1)),
  );
  return normalizeMoneyAmount(
    months
      .filter((m) => m.hasActivity)
      .reduce((sum, m) => sum + m.netProfit, 0),
  );
}

/** Calendar-year net profit (Jan–Dec, live books) — used by filing-aligned estimates. */
async function sumCalendarYearNetProfit(
  userId: string,
  year: number,
): Promise<number> {
  let profit = 0;
  for (let month = 1; month <= 12; month++) {
    const books = await getMonthBooks(userId, year, month);
    profit += books.netProfit;
  }
  return normalizeMoneyAmount(profit);
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

  /**
   * CIT/PIT estimates aligned with annual filing (calendar-year books + classification rules).
   * VAT/WHT/PAYE remain period-specific in getForPeriod.
   */
  async getAnnualTaxEstimates(
    userId: string,
    year: number,
    context: {
      business?: { businessType: string | null; sector: string | null } | null;
      taxProfile: Awaited<ReturnType<typeof buildTaxEligibilityProfileForUser>>;
      fixedAssetRows: Array<{ purchaseCost: Decimal }>;
    },
  ) {
    const [calendarYearProfit, classificationInputs, pitEstimate] =
      await Promise.all([
        sumCalendarYearNetProfit(userId, year),
        resolveCitClassificationInputsForYear(userId, year),
        getPitAnnualEstimateForYear(userId, year),
      ]);

    const fixedAssetsProxy =
      classificationInputs?.fixedAssets ??
      context.taxProfile?.taxEligibility.inputs.totalFixedAssets ??
      context.fixedAssetRows.reduce(
        (s, a) => s + decimalToNumber(a.purchaseCost),
        0,
      );
    const eligibilityTurnover =
      classificationInputs?.turnover ??
      context.taxProfile?.taxEligibility.inputs.annualGrossTurnover ??
      0;
    const providesProfessional =
      context.taxProfile?.taxEligibility.inputs
        .providesProfessionalServicesResolved;

    const citEstimate = estimateCitFromBooks({
      annualizedTurnover: eligibilityTurnover,
      annualizedProfit: calendarYearProfit,
      fixedAssets: fixedAssetsProxy,
      businessType: context.business?.businessType,
      sector: context.business?.sector,
      providesProfessionalServices: providesProfessional,
    });

    return {
      calendarYearProfit,
      classificationInputs,
      citEstimate,
      pitEstimate,
      eligibilityTurnover,
      fixedAssetsProxy,
    };
  },

  async getForPeriod(userId: string, year: number, month: number) {
    const { start, end } = monthDateRangeUtc(year, month);
    const dateRange = { gte: start, lte: end };

    const [sales, expenses, personaPayload, business, fixedAssetRows, taxProfile, classificationInputs, cumulativeProfit] =
      await Promise.all([
        prisma.sale.findMany({
          where: liveSaleWhere(userId, dateRange),
        }),
        prisma.expense.findMany({
          where: liveExpenseWhere(userId, dateRange),
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
        resolveCitClassificationInputsForYear(userId, year),
        cumulativeYearNetProfitWithActivity(userId, year),
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
    const vatableSales = sales
      .filter((x) => x.vatableIncome === true)
      .reduce((s, x) => s + decimalToNumber(x.amount), 0);
    const outputVat = Math.round((vatableSales * VAT_RATE_PERCENT) / PERCENT * 100) / 100;
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
    const netVatPayable = Math.max(0, outputVat - inputVatClaimable);
    const estimatedWhtDeducted =
      (serviceIncome * WHT_RATE_SERVICES_PERCENT) / PERCENT;
    const monthlyProfit = netProfit;

    const fixedAssetsProxy =
      classificationInputs?.fixedAssets ??
      taxProfile?.taxEligibility.inputs.totalFixedAssets ??
      fixedAssetRows.reduce(
        (s, a) => s + decimalToNumber(a.purchaseCost),
        0,
      );
    const eligibilityTurnover =
      classificationInputs?.turnover ??
      taxProfile?.taxEligibility.inputs.annualGrossTurnover ??
      0;
    const providesProfessional =
      taxProfile?.taxEligibility.inputs.providesProfessionalServicesResolved;

    /** Dashboard month tab: tax on this month's profit only. */
    const citMonthlyEstimate = estimateCitFromBooks({
      annualizedTurnover: eligibilityTurnover,
      annualizedProfit: monthlyProfit,
      fixedAssets: fixedAssetsProxy,
      businessType: business?.businessType,
      sector: business?.sector,
      providesProfessionalServices: providesProfessional,
    });
    /** Year view: tax on cumulative profit across all active months in the year. */
    const citCumulativeEstimate = estimateCitFromBooks({
      annualizedTurnover: eligibilityTurnover,
      annualizedProfit: cumulativeProfit,
      fixedAssets: fixedAssetsProxy,
      businessType: business?.businessType,
      sector: business?.sector,
      providesProfessionalServices: providesProfessional,
    });

    const pitMonthlyEstimate = await getPitMonthlyEstimateFromBooks(monthlyProfit);
    const pitCumulativeEstimate = await getPitMonthlyEstimateFromBooks(
      cumulativeProfit,
    );

    const monthlyCitLiability = citMonthlyEstimate.totalCitLiability;
    const monthlyPitPayable = pitMonthlyEstimate.remainingPayable;
    const percentOfCitThreshold =
      (eligibilityTurnover / CIT_TURNOVER_THRESHOLD_NGN) * PERCENT;

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
        summary: normalizeMoneyAmount(monthlyCitLiability),
        periodAmount: normalizeMoneyAmount(monthlyCitLiability),
        isSmallCompany: citCumulativeEstimate.isSmallCompany,
        citClassification: taxProfile?.taxEligibility.citClassification ?? null,
        taxClassLabel: citCumulativeEstimate.taxClassLabel,
        citThreshold: CIT_TURNOVER_THRESHOLD_NGN,
        percentOfThreshold: percentOfCitThreshold,
        monthlyProfit,
        /** Cumulative net profit for all active months in the calendar year (not month × 12). */
        annualizedProfit: cumulativeProfit,
        annualizedTurnover: eligibilityTurnover,
        fixedAssetsProxy,
        turnoverSource: classificationInputs?.turnoverSource ?? "profile",
        fixedAssetsSource: classificationInputs?.fixedAssetsSource ?? "profile",
        citRate: citCumulativeEstimate.citRate,
        levyRate: citCumulativeEstimate.levyRate,
        estimatedAnnualCit: citCumulativeEstimate.estimatedAnnualCit,
        developmentLevy: citCumulativeEstimate.developmentLevy,
        totalCitLiability: citCumulativeEstimate.totalCitLiability,
        capitalAllowances: 0,
        lossCarryForward: 0,
      },
      pit: {
        summary: normalizeMoneyAmount(monthlyPitPayable),
        periodAmount: normalizeMoneyAmount(monthlyPitPayable),
        monthlyProfit,
        /** Same cumulative figure on every month view for the year. */
        annualizedProfit: cumulativeProfit,
        chargeableIncomeProxyAnnual: pitCumulativeEstimate.chargeableIncome,
        estimatedAnnualPit: pitCumulativeEstimate.remainingPayable,
        pitLiability: pitCumulativeEstimate.pitLiability,
        payeCredits: 0,
        whtCredits: 0,
        methodology:
          "Dashboard month PIT/CIT use this month's profit only. annualizedProfit and estimatedAnnualPit use cumulative profit across all active months in the calendar year (not month × 12).",
      },
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

    const cumulativeProfit = anchor.pit.annualizedProfit;

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
        summary: normalizeMoneyAmount(sum((c) => c.cit.periodAmount)),
        periodAmount: normalizeMoneyAmount(sum((c) => c.cit.periodAmount)),
        monthlyProfit: sum((c) => c.overview.netProfit),
        annualizedProfit: cumulativeProfit,
        annualizedTurnover: anchor.cit.annualizedTurnover,
        totalCitLiability: anchor.cit.totalCitLiability,
        estimatedAnnualCit: anchor.cit.estimatedAnnualCit,
      },
      pit: {
        ...anchor.pit,
        summary: normalizeMoneyAmount(sum((c) => c.pit.periodAmount)),
        periodAmount: normalizeMoneyAmount(sum((c) => c.pit.periodAmount)),
        monthlyProfit: sum((c) => c.overview.netProfit),
        annualizedProfit: cumulativeProfit,
        estimatedAnnualPit: anchor.pit.estimatedAnnualPit,
        chargeableIncomeProxyAnnual: anchor.pit.chargeableIncomeProxyAnnual,
      },
      paye: {
        ...anchor.paye,
        derivedFrom: payeDerivedFrom,
        summaryMonthlyEstimate: payeMonthlyTotal,
        periodAmount: payeMonthlyTotal,
        summaryAnnualEstimate: payeMonthlyTotal * (12 / months.length),
      },
      localGovLevies: anchor.localGovLevies,
    };
  },
};
