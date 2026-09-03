import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  amountsMatch,
  citDueDateForYear,
  citYearEndForYear,
  computeCapitalAllowanceForAsset,
  computeCitFromSnapshot,
  CIT_PERIOD_MONTH,
  isCitYearOpenForFiling,
  isProfessionalServicesBusiness,
  type CitComputationSnapshot,
} from "../../constants/citFiling";
import { PERCENT, WHT_RATE_SERVICES_PERCENT } from "../../constants/percentages";
import { isFinalWhtPayerCategory, normalizePayerCategory } from "../../constants/pitFiling";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { monthDateRangeUtc } from "../../utils/dateRangeQuery";
import { businessProfileMoneyToNumber } from "../../constants/businessProfile";
import { assetsService } from "./assetsService";
import { evidenceVaultService } from "./evidenceVaultService";
import { taxComputationService } from "./taxComputationService";
import { userService } from "./userService";
import type { CitDraftInputs } from "../../constants/filingWorkspace";
import { completionPercentFromStep } from "../../constants/filingWorkspace";
import {
  copyCarryForwardOnSubmit,
  getCitPriorYearCarry,
} from "./filingCarryForwardService";
import { resolveCitClassificationInputsForYear } from "./citClassificationInputsService";
import {
  normalizeProvidesProfessionalServices,
  normalizePrimaryBusinessActivity,
  resolveProvidesProfessionalServices,
} from "../../constants/taxEligibility";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  return Number(v);
}

async function sumAnnualTurnoverAndProfit(
  userId: string,
  year: number,
): Promise<{ turnover: number; accountingProfit: number }> {
  let turnover = 0;
  let accountingProfit = 0;
  for (let month = 1; month <= 12; month++) {
    const { start, end } = monthDateRangeUtc(year, month);
    const [sales, expenses] = await Promise.all([
      prisma.sale.findMany({
        where: { userId, saleDate: { gte: start, lte: end } },
        select: { amount: true, totalAmount: true },
      }),
      prisma.expense.findMany({
        where: { userId, expenseDate: { gte: start, lte: end } },
        select: { amount: true },
      }),
    ]);
    const income = sales.reduce((s, x) => s + d(x.amount), 0);
    const grossSales = sales.reduce((s, x) => s + d(x.totalAmount), 0);
    const exp = expenses.reduce((s, x) => s + d(x.amount), 0);
    turnover += grossSales;
    accountingProfit += income - exp;
  }
  return {
    turnover: normalizeMoneyAmount(turnover),
    accountingProfit: normalizeMoneyAmount(accountingProfit),
  };
}

async function sumPayerWhtCredits(userId: string): Promise<number> {
  const payers = await prisma.payer.findMany({
    where: { userId },
    include: {
      transactions: { where: { status: { not: "VOID" } } },
    },
  });
  let total = 0;
  for (const payer of payers) {
    const category = normalizePayerCategory(payer.category);
    if (isFinalWhtPayerCategory(category)) continue;
    if (!payer.whtApplicable) continue;
    const fees = normalizeMoneyAmount(
      payer.transactions.reduce((s, t) => s + d(t.amount), 0),
    );
    const rate = d(payer.whtRate) || WHT_RATE_SERVICES_PERCENT;
    total += Math.round((fees * rate) / PERCENT);
  }
  return normalizeMoneyAmount(total);
}

async function buildCapitalAllowanceSchedule(userId: string, year: number) {
  const rows = await prisma.asset.findMany({
    where: { userId },
    orderBy: { purchaseDate: "asc" },
  });
  const allowances = [];
  for (const row of rows) {
    const allowance = computeCapitalAllowanceForAsset(
      {
        id: row.id,
        name: row.assetName,
        assetType: row.assetType,
        cost: d(row.purchaseCost),
        purchaseDate: row.purchaseDate.toISOString().slice(0, 10),
        status: row.status,
      },
      year,
    );
    if (allowance) allowances.push(allowance);
  }
  const available = allowances.reduce((s, a) => s + a.claimedThisYear, 0);
  return { allowances, available };
}

function validateSubmitBody(
  body: Record<string, unknown>,
  business?: {
    businessType: string | null;
    sector: string | null;
    providesProfessionalServices: string | null;
    primaryBusinessActivity: string | null;
  } | null,
): CitComputationSnapshot {
  const periodYear = Number(body.periodYear);
  const rcNumber = String(body.rcNumber ?? "").trim();
  const tin = String(body.tin ?? "").trim();
  const dueDate = String(body.dueDate ?? "");
  const amount = Number(body.amount);
  const computation = body.computation as CitComputationSnapshot | undefined;

  if (!rcNumber || !tin) {
    throw new HttpReplyError(
      400,
      "Add your RC number and TIN before filing.",
      null,
      "VALIDATION_ERROR",
    );
  }
  if (Number(body.periodMonth) !== CIT_PERIOD_MONTH) {
    throw new HttpReplyError(
      400,
      "CIT filings must use periodMonth 12.",
      null,
      "VALIDATION_ERROR",
    );
  }
  const expectedDue = citDueDateForYear(periodYear);
  if (dueDate !== expectedDue) {
    throw new HttpReplyError(
      400,
      `dueDate must be ${expectedDue}.`,
      null,
      "VALIDATION_ERROR",
    );
  }
  if (!isCitYearOpenForFiling(periodYear)) {
    throw new HttpReplyError(
      400,
      `The ${periodYear + 1} return can be filed from 1 January ${periodYear + 1}.`,
      null,
      "YEAR_NOT_OPEN",
    );
  }
  if (!computation || typeof computation !== "object") {
    throw new HttpReplyError(
      400,
      "computation is required.",
      null,
      "VALIDATION_ERROR",
    );
  }

  const recomputed = computeCitFromSnapshot({
    year: periodYear,
    turnover: Number(computation.turnover),
    fixedAssets: Number(computation.fixedAssets),
    accountingProfit: Number(computation.accountingProfit),
    depreciation: Number(computation.depreciation),
    fines: Number(computation.fines),
    directorsPersonal: Number(computation.directorsPersonal),
    otherNonAllowable: Number(computation.otherNonAllowable),
    frankedDividends: Number(computation.frankedDividends),
    chargeableGains: Number(computation.chargeableGains),
    lossCarryForward: Number(computation.lossCarryForward),
    capitalAllowancesAvailable: Number(computation.capitalAllowancesAvailable),
    whtCredits: Number(computation.whtCredits),
    rcNumber,
    tin,
    companyName: String(computation.companyName ?? body.companyName ?? ""),
    businessType: business?.businessType ?? null,
    sector: business?.sector ?? null,
    providesProfessionalServices: business
      ? resolveProvidesProfessionalServices({
          providesProfessionalServices: normalizeProvidesProfessionalServices(
            business.providesProfessionalServices,
          ),
          primaryBusinessActivity: normalizePrimaryBusinessActivity(
            business.primaryBusinessActivity,
          ),
          businessType: business.businessType,
          sector: business.sector,
        })
      : undefined,
    allowances: computation.allowances ?? [],
  });

  if (
    recomputed.isSmallCompany !== Boolean(computation.isSmallCompany) ||
    recomputed.taxClassCode !== computation.taxClassCode
  ) {
    throw new HttpReplyError(
      400,
      "Company classification does not match turnover and fixed assets.",
      null,
      "VALIDATION_ERROR",
    );
  }

  if (
    !amountsMatch(recomputed.citPayable, amount) ||
    !amountsMatch(recomputed.citPayable, computation.citPayable)
  ) {
    throw new HttpReplyError(
      400,
      "CIT amount does not match the computation.",
      null,
      "AMOUNT_MISMATCH",
    );
  }

  return {
    ...recomputed,
    rcNumber,
    tin,
    companyName: String(computation.companyName ?? ""),
    allowances: computation.allowances ?? recomputed.allowances,
  };
}

export const citFilingService = {
  async getCalculation(userId: string, year: number) {
    const [
      books,
      dashboard,
      caSchedule,
      payerWht,
      profile,
      business,
      existing,
      priorCarry,
    ] = await Promise.all([
      sumAnnualTurnoverAndProfit(userId, year),
      assetsService.dashboard(userId),
      buildCapitalAllowanceSchedule(userId, year),
      sumPayerWhtCredits(userId),
      userService.getBusinessProfile(userId),
      prisma.business.findFirst({ where: { userId } }),
      prisma.taxPayable.findUnique({
        where: {
          userId_taxType_periodYear_periodMonth: {
            userId,
            taxType: "CIT",
            periodYear: year,
            periodMonth: CIT_PERIOD_MONTH,
          },
        },
      }),
      getCitPriorYearCarry(userId, year),
    ]);

    if (existing?.frozen && existing.computation) {
      const computation = existing.computation as CitComputationSnapshot;
      return {
        year,
        dueDate: citDueDateForYear(year),
        yearEnd: citYearEndForYear(year),
        yearOpenForFiling: isCitYearOpenForFiling(year),
        alreadyFiled: existing.submittedAt != null,
        filingId: existing.submittedAt != null ? existing.id : null,
        tin: profile?.tin ?? null,
        rcNumber: profile?.rcNumber ?? null,
        companyName: profile?.businessName ?? null,
        computation,
        frozen: true,
        warning: existing.booksChangedSinceFreeze
          ? "Books changed since computation was confirmed. Re-confirm step 1 to update figures."
          : undefined,
        priorYearCarry: priorCarry,
      };
    }

    const draftInputs =
      existing?.draftInputs && typeof existing.draftInputs === "object"
        ? (existing.draftInputs as CitDraftInputs)
        : null;
    const adjustments = draftInputs?.adjustments ?? {};
    const storedCarry =
      existing?.priorPeriodCarry && typeof existing.priorPeriodCarry === "object"
        ? (existing.priorPeriodCarry as {
            unutilizedCapitalAllowances?: number;
            unrelievedLoss?: number;
            unutilizedWhtCredits?: number;
          })
        : null;
    const carry = storedCarry ?? priorCarry;

    const month =
      year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;
    const taxComp = await taxComputationService.getForPeriod(
      userId,
      year,
      month,
    );
    const classificationInputs = await resolveCitClassificationInputsForYear(
      userId,
      year,
    );
    const booksWht = normalizeMoneyAmount(
      (taxComp.wht.estimatedWhtDeducted / Math.max(1, month)) * 12,
    );
    const accountingProfit =
      books.accountingProfit > 0
        ? books.accountingProfit
        : taxComp.cit.annualizedProfit;
    const turnover = classificationInputs?.turnover ?? books.turnover;
    const fixedAssets = classificationInputs?.fixedAssets ?? 0;
    const providesProfessional = business
      ? resolveProvidesProfessionalServices({
          providesProfessionalServices: normalizeProvidesProfessionalServices(
            business.providesProfessionalServices,
          ),
          primaryBusinessActivity: normalizePrimaryBusinessActivity(
            business.primaryBusinessActivity,
          ),
          businessType: business.businessType,
          sector: business.sector,
        })
      : isProfessionalServicesBusiness(
          profile?.businessType,
          profile?.sector,
        );
    const depreciation =
      adjustments.depreciation ??
      (dashboard.plImpact.annualDepreciationCharge ||
        dashboard.summary.annualDepreciation ||
        0);
    const caFromSchedule = caSchedule.available > 0
      ? caSchedule.available
      : taxComp.cit.capitalAllowances ||
        dashboard.plImpact.capitalAllowance ||
        0;
    const capitalAllowancesAvailable =
      caFromSchedule + (carry?.unutilizedCapitalAllowances ?? 0);
    const defaultLoss = carry?.unrelievedLoss ?? taxComp.cit.lossCarryForward ?? 0;
    const defaultWht =
      Math.max(booksWht, payerWht) + (carry?.unutilizedWhtCredits ?? 0);

    const computation = computeCitFromSnapshot({
      year,
      turnover,
      fixedAssets,
      accountingProfit,
      depreciation,
      fines: adjustments.fines ?? 0,
      directorsPersonal: adjustments.directorsPersonal ?? 0,
      otherNonAllowable: adjustments.otherNonAllowable ?? 0,
      frankedDividends: adjustments.frankedDividends ?? 0,
      chargeableGains: adjustments.chargeableGains ?? 0,
      lossCarryForward: adjustments.lossCarryForward ?? defaultLoss,
      capitalAllowancesAvailable,
      whtCredits: adjustments.whtCredits ?? defaultWht,
      rcNumber: profile?.rcNumber?.trim() ?? "",
      tin: profile?.tin?.trim() ?? "",
      companyName: profile?.businessName?.trim() ?? "",
      businessType: business?.businessType ?? profile?.businessType ?? null,
      sector: business?.sector ?? profile?.sector ?? null,
      providesProfessionalServices: providesProfessional,
      allowances: caSchedule.allowances,
    });

    return {
      year,
      dueDate: citDueDateForYear(year),
      yearEnd: citYearEndForYear(year),
      yearOpenForFiling: isCitYearOpenForFiling(year),
      alreadyFiled: existing?.submittedAt != null,
      filingId: existing?.submittedAt != null ? existing.id : null,
      tin: profile?.tin ?? null,
      rcNumber: profile?.rcNumber ?? null,
      companyName: profile?.businessName ?? null,
      computation,
      draftApplied: draftInputs != null,
      priorYearCarry: carry,
      inputs: {
        turnover,
        fixedAssets,
        turnoverSource: classificationInputs?.turnoverSource ?? "profile",
        fixedAssetsSource: classificationInputs?.fixedAssetsSource ?? "profile",
        usesTransactionTurnover:
          classificationInputs?.usesTransactionTurnover ?? false,
        businessMonthsElapsed:
          classificationInputs?.businessMonthsElapsed ?? 0,
        profileTurnover: businessProfileMoneyToNumber(
          business?.annualGrossTurnover,
        ),
        profileFixedAssets: businessProfileMoneyToNumber(
          business?.totalFixedAssets,
        ),
        booksTurnover: books.turnover,
        accountingProfit,
        depreciation,
        capitalAllowancesAvailable,
        booksLossCarryForward: taxComp.cit.lossCarryForward ?? 0,
        payerWhtCredits: payerWht,
        booksWhtCredits: booksWht,
      },
    };
  },

  async submit(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<{ id: string; status: string; submissionDate: Date; completionPercent?: number }> {
    const periodYear = Number(body.periodYear);
    const amount = Number(body.amount);
    const rcNumber = String(body.rcNumber).trim();
    const tin = String(body.tin).trim();
    const dueDate = new Date(String(body.dueDate));
    const paymentStatus =
      body.paymentStatus === "paid" ? "paid" : "unpaid";
    const evidenceVaultId =
      body.evidenceVaultId != null && String(body.evidenceVaultId).trim() !== ""
        ? String(body.evidenceVaultId)
        : null;

    if (evidenceVaultId) {
      const doc = await evidenceVaultService.getDocumentById(
        userId,
        evidenceVaultId,
      );
      if (!doc) {
        throw new HttpReplyError(
          400,
          "Evidence vault document not found.",
          null,
          "VALIDATION_ERROR",
        );
      }
    }

    const existing = await prisma.taxPayable.findUnique({
      where: {
        userId_taxType_periodYear_periodMonth: {
          userId,
          taxType: "CIT",
          periodYear,
          periodMonth: CIT_PERIOD_MONTH,
        },
      },
    });
    if (existing?.submittedAt != null) {
      throw new HttpReplyError(
        409,
        `CIT return already recorded for ${periodYear}.`,
        null,
        "DUPLICATE_FILING",
      );
    }

    const business = await prisma.business.findFirst({ where: { userId } });
    const rawComputation = body.computation as CitComputationSnapshot;
    const computation = validateSubmitBody(
      {
        ...body,
        computation: {
          ...rawComputation,
          rcNumber,
          tin,
        },
      },
      business,
    );

    const submittedAt = new Date();
    const payableStatus =
      amount <= 0 || paymentStatus === "paid" ? "paid" : "pending";
    const storedPaymentStatus =
      amount <= 0 || paymentStatus === "paid" ? "paid" : "unpaid";

    const submissionReference =
      body.submissionReference != null
        ? String(body.submissionReference).trim()
        : "";
    const completedSteps = Array.from({ length: 8 }, (_, i) => i + 1);

    const taxPayable = await prisma.taxPayable.upsert({
      where: {
        userId_taxType_periodYear_periodMonth: {
          userId,
          taxType: "CIT",
          periodYear,
          periodMonth: CIT_PERIOD_MONTH,
        },
      },
      create: {
        userId,
        taxType: "CIT",
        periodYear,
        periodMonth: CIT_PERIOD_MONTH,
        amountDue: new Decimal(amount),
        penalties: new Decimal(0),
        totalPayable: new Decimal(amount),
        filingDueDate: dueDate,
        status: payableStatus,
        paymentStatus: storedPaymentStatus,
        submittedAt,
        tin,
        rcNumber,
        companyName: computation.companyName || null,
        computation: computation as object,
        documentUrl:
          body.documentUrl != null ? String(body.documentUrl) : null,
        evidenceVaultId,
        receiptUrl: body.receiptUrl != null ? String(body.receiptUrl) : null,
        submissionReference: submissionReference || null,
        currentStep: 8,
        completedSteps,
        frozen: true,
        frozenAt: submittedAt,
      },
      update: {
        amountDue: new Decimal(amount),
        totalPayable: new Decimal(amount),
        filingDueDate: dueDate,
        status: payableStatus,
        paymentStatus: storedPaymentStatus,
        submittedAt,
        tin,
        rcNumber,
        companyName: computation.companyName || null,
        computation: computation as object,
        documentUrl:
          body.documentUrl != null ? String(body.documentUrl) : null,
        evidenceVaultId,
        receiptUrl: body.receiptUrl != null ? String(body.receiptUrl) : null,
        submissionReference: submissionReference || null,
        currentStep: 8,
        completedSteps,
        frozen: true,
        frozenAt: submittedAt,
      },
    });

    await copyCarryForwardOnSubmit(
      userId,
      "CIT",
      periodYear,
      CIT_PERIOD_MONTH,
      computation as unknown as Record<string, unknown>,
    );

    await prisma.filingTimelineEvent.create({
      data: {
        taxPayableId: taxPayable.id,
        event: "SUBMITTED",
        description: "CIT annual return recorded",
        eventDate: submittedAt,
      },
    });

    return {
      id: taxPayable.id,
      status: "submitted",
      submissionDate: submittedAt,
      completionPercent: completionPercentFromStep(8),
    };
  },

  async saveDraft(userId: string, body: CitDraftInputs & { periodYear: number }) {
    const { filingWorkspaceService } = await import("./filingWorkspaceService");
    return filingWorkspaceService.saveCitDraft(userId, body);
  },
};
