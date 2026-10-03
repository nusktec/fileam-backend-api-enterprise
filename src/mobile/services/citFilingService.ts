import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  citDueDateForYear,
  citYearEndForYear,
  computeCitFromSnapshot,
  CIT_PERIOD_MONTH,
  isCitYearOpenForFiling,
  isProfessionalServicesBusiness,
  type CitAllowanceRow,
  type CitComputationSnapshot,
} from "../../constants/citFiling";
import { PERCENT, WHT_RATE_SERVICES_PERCENT } from "../../constants/percentages";
import { isFinalWhtPayerCategory, normalizePayerCategory } from "../../constants/pitFiling";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { monthDateRangeUtc } from "../../utils/dateRangeQuery";
import { liveExpenseWhere, liveSaleWhere } from "../../utils/liveBookQuery";
import { isUndoneStatus } from "../../constants/recordUndo";
import { businessProfileMoneyToNumber } from "../../constants/businessProfile";
import { assetsService } from "./assetsService";
import { capitalAllowanceService } from "./capitalAllowanceService";
import { evidenceVaultService } from "./evidenceVaultService";
import { taxComputationService } from "./taxComputationService";
import { userService } from "./userService";
import type { CitDraftInputs } from "../../constants/filingWorkspace";
import { completionPercentFromStep } from "../../constants/filingWorkspace";
import {
  isFilingCompliant,
  reopenPrematurelyClosedFilings,
  requireSubmissionReference,
  step8WorkspacePatch,
  yearNotOpenMessage,
} from "../../constants/filingStatusRules";
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
        where: liveSaleWhere(userId, { gte: start, lte: end }),
        select: { amount: true, totalAmount: true },
      }),
      prisma.expense.findMany({
        where: liveExpenseWhere(userId, { gte: start, lte: end }),
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
      transactions: true,
    },
  });
  let total = 0;
  for (const payer of payers) {
    const category = normalizePayerCategory(payer.category);
    if (isFinalWhtPayerCategory(category)) continue;
    if (!payer.whtApplicable) continue;
    const fees = normalizeMoneyAmount(
      payer.transactions
        .filter((t) => !isUndoneStatus(t.status))
        .reduce((s, t) => s + d(t.amount), 0),
    );
    const rate = d(payer.whtRate) || WHT_RATE_SERVICES_PERCENT;
    total += Math.round((fees * rate) / PERCENT);
  }
  return normalizeMoneyAmount(total);
}

async function capitalAllowancesForCit(userId: string, year: number): Promise<{
  available: number;
  allowances: CitAllowanceRow[];
  booksFixedAssets: number;
}> {
  return capitalAllowanceService.getBooksAllowancesForYear(userId, year);
}

function validateSubmitBody(body: Record<string, unknown>): void {
  const periodYear = Number(body.periodYear);
  if (!isCitYearOpenForFiling(periodYear)) {
    throw new HttpReplyError(
      400,
      yearNotOpenMessage(periodYear),
      null,
      "YEAR_NOT_OPEN",
    );
  }
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
      capitalAllowancesForCit(userId, year),
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
        alreadyFiled: isFilingCompliant(existing),
        filingId: existing.id,
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
    const broughtForwardCa = Math.max(
      0,
      carry?.unutilizedCapitalAllowances ?? 0,
    );
    const capitalAllowancesAvailable = normalizeMoneyAmount(
      caSchedule.available + broughtForwardCa,
    );
    const allowances =
      broughtForwardCa > 0
        ? [
            {
              id: "unutilized-bf",
              name: "Unutilized capital allowances brought forward",
              category: "Brought forward",
              cost: broughtForwardCa,
              annualRate: 0,
              claimedThisYear: broughtForwardCa,
              taxYear: year,
              source: "brought_forward" as const,
            },
            ...caSchedule.allowances,
          ]
        : caSchedule.allowances;
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
      allowances,
    });

    return {
      year,
      dueDate: citDueDateForYear(year),
      yearEnd: citYearEndForYear(year),
      yearOpenForFiling: isCitYearOpenForFiling(year),
      alreadyFiled: existing ? isFilingCompliant(existing) : false,
      filingId: existing?.id ?? null,
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
        booksFixedAssets: caSchedule.booksFixedAssets,
        accountingProfit,
        depreciation,
        capitalAllowancesAvailable,
        capitalAllowancesBroughtForward: broughtForwardCa,
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
    validateSubmitBody(body);
    await reopenPrematurelyClosedFilings(userId);

    const periodYear = Number(body.periodYear);
    const amount = Number.isFinite(Number(body.amount))
      ? Number(body.amount)
      : 0;
    const rcNumber = String(body.rcNumber ?? "").trim();
    const tin = String(body.tin ?? "").trim();
    const dueDate = body.dueDate
      ? new Date(String(body.dueDate))
      : new Date(citDueDateForYear(periodYear));
    const evidenceVaultId =
      body.evidenceVaultId != null && String(body.evidenceVaultId).trim() !== ""
        ? String(body.evidenceVaultId)
        : null;
    const submissionReference = requireSubmissionReference(
      body.submissionReference,
    );

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
    const step8 = step8WorkspacePatch(existing ?? undefined);
    const computation = (body.computation ?? {}) as CitComputationSnapshot;

    const recordedAt = new Date();
    const payableStatus = step8.status;
    const storedPaymentStatus = step8.paymentStatus;

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
        submittedAt: recordedAt,
        tin,
        rcNumber,
        companyName: computation.companyName || null,
        computation: computation as object,
        documentUrl:
          body.documentUrl != null ? String(body.documentUrl) : null,
        evidenceVaultId,
        receiptUrl: body.receiptUrl != null ? String(body.receiptUrl) : null,
        submissionReference,
        currentStep: step8.currentStep,
        completedSteps: step8.completedSteps,
      },
      update: {
        amountDue: new Decimal(amount),
        totalPayable: new Decimal(amount),
        filingDueDate: dueDate,
        status: payableStatus,
        paymentStatus: storedPaymentStatus,
        submittedAt: recordedAt,
        tin,
        rcNumber,
        companyName: computation.companyName || null,
        computation: computation as object,
        documentUrl:
          body.documentUrl != null ? String(body.documentUrl) : null,
        evidenceVaultId,
        receiptUrl: body.receiptUrl != null ? String(body.receiptUrl) : null,
        submissionReference,
        currentStep: step8.currentStep,
        completedSteps: step8.completedSteps,
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
        eventDate: recordedAt,
      },
    });

    return {
      id: taxPayable.id,
      status: "pending",
      submissionDate: recordedAt,
      completionPercent: completionPercentFromStep(step8.currentStep),
    };
  },

  async saveDraft(userId: string, body: CitDraftInputs & { periodYear: number }) {
    const { filingWorkspaceService } = await import("./filingWorkspaceService");
    return filingWorkspaceService.saveCitDraft(userId, body);
  },
};
