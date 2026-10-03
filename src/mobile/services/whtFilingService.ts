import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { WORKSPACE_TIMELINE_EVENTS } from "../../constants/filingWorkspace";
import { completionPercentFromStep } from "../../constants/filingWorkspace";
import {
  isFilingCompliant,
  overviewFilingStatusFromRow,
  reopenPrematurelyClosedFilings,
  requireSubmissionReference,
  step8WorkspacePatch,
} from "../../constants/filingStatusRules";
import { VAT_FILING_DAY } from "../../constants/taxPayable";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { computeWhtFigures, vatWhtOverviewService } from "./vatWhtOverviewService";
import { monthLabelFromKey, nextMonthKey, lagosTodayYmd } from "../../utils/lagosCalendar";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function getFilingDueDate(year: number, month: number): Date {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(nextYear, nextMonth - 1, VAT_FILING_DAY);
}

export const whtFilingService = {
  async getSchedule(
    userId: string,
    periodYear: number,
    periodMonth: number,
    _whtType?: string,
  ) {
    vatWhtOverviewService.parseAndGuardPeriod(
      `${periodYear}-${String(periodMonth).padStart(2, "0")}`,
    );
    const existing = await prisma.taxPayable.findUnique({
      where: {
        userId_taxType_periodYear_periodMonth: {
          userId,
          taxType: "WHT",
          periodYear,
          periodMonth,
        },
      },
    });

    if (existing?.frozen && existing.computation) {
      const frozen = existing.computation as {
        vendors?: Array<Record<string, unknown>>;
        totalWht?: number;
      };
      const vendors = (frozen.vendors ?? []).map((v) => ({
        supplierId: String(v.supplierId ?? v.vendorName ?? ""),
        supplierName: String(v.supplierName ?? v.vendorName ?? ""),
        description: String(v.description ?? ""),
        category: String(v.category ?? ""),
        grossAmount: Number(v.grossAmount ?? 0),
        whtRate: Number(v.whtRate ?? 0),
        whtDeducted: Number(v.whtDeducted ?? 0),
      }));
      return {
        periodYear,
        periodMonth,
        periodLabel: `${new Date(periodYear, periodMonth - 1).toLocaleString("default", { month: "long" })} ${periodYear}`,
        whtType: _whtType ?? "MIXED",
        vendors,
        totalWht: frozen.totalWht ?? decimalToNumber(existing.totalPayable),
        dueDate: getFilingDueDate(periodYear, periodMonth),
        frozen: true,
        alreadyFiled: isFilingCompliant(existing),
        filingId: existing.id,
      };
    }

    const periodKey = `${periodYear}-${String(periodMonth).padStart(2, "0")}`;
    const figures = await computeWhtFigures(userId, periodKey);
    const dueNext = nextMonthKey(periodKey);
    const dueDate = `${dueNext}-${String(VAT_FILING_DAY).padStart(2, "0")}`;
    return {
      periodYear,
      periodMonth,
      periodLabel: monthLabelFromKey(periodKey),
      whtType: figures.whtType,
      vendors: figures.vendors,
      totalWht: figures.totalWht,
      totalGross: figures.totalGross,
      corporateAmount: figures.corporateAmount,
      individualAmount: figures.individualAmount,
      dueDate,
      filingStatus: overviewFilingStatusFromRow(
        existing
          ? { status: existing.status, completedSteps: existing.completedSteps }
          : null,
        dueDate,
        lagosTodayYmd(),
      ),
      alreadyFiled: existing ? isFilingCompliant(existing) : false,
      filingId: existing?.id ?? null,
      nrsTotal: figures.totalWht,
      stateTotal: 0,
    };
  },

  async createOrUpdateDraft(
    userId: string,
    params: {
      periodYear: number;
      periodMonth: number;
      whtType?: string;
      lines: Array<{
        vendorName: string;
        description: string;
        category: string;
        grossAmount: number;
        whtRate: number;
        whtDeducted: number;
      }>;
    },
  ) {
    const schedule = await this.getSchedule(
      userId,
      params.periodYear,
      params.periodMonth,
      params.whtType,
    );

    const draft = await prisma.filingDraft.upsert({
      where: {
        userId_taxType_periodYear_periodMonth: {
          userId,
          taxType: "WHT",
          periodYear: params.periodYear,
          periodMonth: params.periodMonth,
        },
      },
      create: {
        userId,
        taxType: "WHT",
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
        whtType: params.whtType ?? schedule.whtType,
        status: "draft",
      },
      update: {
        whtType: params.whtType ?? schedule.whtType,
      },
    });

    await prisma.whtScheduleLine.deleteMany({
      where: { filingDraftId: draft.id },
    });
    const lines = schedule.vendors.map((v) => ({
      vendorName: v.supplierName,
      description: v.description,
      category: v.category,
      grossAmount: v.grossAmount,
      whtRate: v.whtRate,
      whtDeducted: v.whtDeducted,
    }));
    if (lines.length) {
      await prisma.whtScheduleLine.createMany({
        data: lines.map((l) => ({
          filingDraftId: draft.id,
          vendorName: l.vendorName,
          description: l.description,
          category: l.category,
          grossAmount: new Decimal(l.grossAmount),
          whtRate: new Decimal(l.whtRate),
          whtDeducted: new Decimal(l.whtDeducted),
        })),
      });
    }

    const { filingWorkspaceService } = await import("./filingWorkspaceService");
    await filingWorkspaceService.ensureDraftWorkspace(
      userId,
      "WHT",
      params.periodYear,
      params.periodMonth,
    );

    return draft;
  },

  async submit(
    userId: string,
    params: {
      periodYear: number;
      periodMonth: number;
      totalWht: number;
      dueDate: Date;
      paymentStatus: "paid" | "not_paid";
      receiptUrl?: string;
      documentUrl?: string;
      evidenceVaultId?: string;
      submissionReference?: string;
    },
  ) {
    await reopenPrematurelyClosedFilings(userId);
    const submissionReference = requireSubmissionReference(
      params.submissionReference,
    );
    const schedule = await this.getSchedule(
      userId,
      params.periodYear,
      params.periodMonth,
    );
    const recalculated = normalizeMoneyAmount(schedule.totalWht);

    const filingDueDate =
      params.dueDate instanceof Date
        ? params.dueDate
        : new Date(params.dueDate);
    const recordedAt = new Date();
    const existing = await prisma.taxPayable.findUnique({
      where: {
        userId_taxType_periodYear_periodMonth: {
          userId,
          taxType: "WHT",
          periodYear: params.periodYear,
          periodMonth: params.periodMonth,
        },
      },
    });
    const step8 = step8WorkspacePatch(existing ?? undefined);

    const taxPayable = await prisma.taxPayable.upsert({
      where: {
        userId_taxType_periodYear_periodMonth: {
          userId,
          taxType: "WHT",
          periodYear: params.periodYear,
          periodMonth: params.periodMonth,
        },
      },
      create: {
        userId,
        taxType: "WHT",
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
        amountDue: new Decimal(recalculated),
        penalties: new Decimal(0),
        totalPayable: new Decimal(recalculated),
        filingDueDate,
        status: step8.status,
        paymentStatus: step8.paymentStatus,
        submittedAt: recordedAt,
        documentUrl: params.documentUrl ?? null,
        evidenceVaultId: params.evidenceVaultId ?? null,
        receiptUrl: params.receiptUrl ?? null,
        submissionReference,
        computation: {
          totalWht: recalculated,
          vendors: schedule.vendors,
        },
        currentStep: step8.currentStep,
        completedSteps: step8.completedSteps,
      },
      update: {
        amountDue: new Decimal(recalculated),
        totalPayable: new Decimal(recalculated),
        submittedAt: recordedAt,
        documentUrl: params.documentUrl ?? undefined,
        evidenceVaultId: params.evidenceVaultId ?? undefined,
        receiptUrl: params.receiptUrl ?? undefined,
        status: step8.status,
        paymentStatus: step8.paymentStatus,
        submissionReference,
        computation: {
          totalWht: recalculated,
          vendors: schedule.vendors,
        },
        currentStep: step8.currentStep,
        completedSteps: step8.completedSteps,
      },
    });

    await prisma.filingTimelineEvent.create({
      data: {
        taxPayableId: taxPayable.id,
        event: WORKSPACE_TIMELINE_EVENTS.SUBMITTED,
        description: "WHT return recorded",
        eventDate: recordedAt,
      },
    });

    return {
      id: taxPayable.id,
      submissionDate: recordedAt,
      period: `${params.periodYear}-${String(params.periodMonth).padStart(2, "0")}`,
      amount: recalculated,
      status: "pending",
      completionPercent: completionPercentFromStep(step8.currentStep),
    };
  },
};
