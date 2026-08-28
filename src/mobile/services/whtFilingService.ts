import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { WORKSPACE_TIMELINE_EVENTS } from "../../constants/filingWorkspace";
import { completionPercentFromStep } from "../../constants/filingWorkspace";
import { VAT_FILING_DAY } from "../../constants/taxPayable";
import { HttpReplyError } from "../../utils/httpReplyError";
import { monthDateRangeUtc } from "../../utils/dateRangeQuery";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function getFilingDueDate(year: number, month: number): Date {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(nextYear, nextMonth - 1, VAT_FILING_DAY);
}

async function buildBeneficiarySchedule(
  userId: string,
  periodYear: number,
  periodMonth: number,
) {
  const { start, end } = monthDateRangeUtc(periodYear, periodMonth);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const payments = await prisma.beneficiaryTransaction.findMany({
    where: {
      entryType: "PAYMENT",
      status: { not: "VOID" },
      date: { gte: startStr, lte: endStr },
      beneficiary: { userId },
      whtAmount: { gt: 0 },
    },
    include: {
      beneficiary: {
        select: {
          id: true,
          name: true,
          entityType: true,
          residency: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  return payments.map((p) => ({
    supplierId: p.beneficiaryId,
    supplierName: p.beneficiary.name,
    description: p.description,
    category: p.whtClass,
    grossAmount: decimalToNumber(p.grossAmount),
    whtRate: decimalToNumber(p.whtRate),
    whtDeducted: normalizeMoneyAmount(decimalToNumber(p.whtAmount)),
  }));
}

export const whtFilingService = {
  async getSchedule(
    userId: string,
    periodYear: number,
    periodMonth: number,
    _whtType?: string,
  ) {
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
        alreadyFiled: existing.submittedAt != null,
      };
    }

    let vendors = await buildBeneficiarySchedule(
      userId,
      periodYear,
      periodMonth,
    );

    if (vendors.length === 0) {
      const legacy = await prisma.vendorPayment.findMany({
        where: { userId, periodYear, periodMonth },
        orderBy: { vendorName: "asc" },
      });
      vendors = legacy.map((v) => ({
        supplierId: v.id,
        supplierName: v.vendorName,
        description: v.description,
        category: v.category,
        grossAmount: decimalToNumber(v.grossAmount),
        whtRate: decimalToNumber(v.whtRate),
        whtDeducted: decimalToNumber(v.whtDeducted),
      }));
    }

    const totalWht = vendors.reduce((s, l) => s + l.whtDeducted, 0);
    const dueDate = getFilingDueDate(periodYear, periodMonth);
    return {
      periodYear,
      periodMonth,
      periodLabel: `${new Date(periodYear, periodMonth - 1).toLocaleString("default", { month: "long" })} ${periodYear}`,
      whtType: vendors.length > 0 ? "MIXED" : (_whtType ?? "MIXED"),
      vendors,
      totalWht: normalizeMoneyAmount(totalWht),
      dueDate,
      alreadyFiled: existing?.submittedAt != null,
      nrsTotal: normalizeMoneyAmount(totalWht),
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
    const schedule = await this.getSchedule(
      userId,
      params.periodYear,
      params.periodMonth,
    );
    const recalculated = normalizeMoneyAmount(schedule.totalWht);
    if (Math.abs(recalculated - params.totalWht) > 1) {
      throw new HttpReplyError(
        400,
        "WHT total does not match schedule.",
        null,
        "AMOUNT_MISMATCH",
      );
    }

    const filingDueDate =
      params.dueDate instanceof Date
        ? params.dueDate
        : new Date(params.dueDate);
    const submittedAt = new Date();
    const status = params.paymentStatus === "paid" ? "paid" : "pending";
    const completedSteps = Array.from({ length: 8 }, (_, i) => i + 1);

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
        status,
        submittedAt,
        documentUrl: params.documentUrl ?? null,
        evidenceVaultId: params.evidenceVaultId ?? null,
        receiptUrl: params.receiptUrl ?? null,
        submissionReference: params.submissionReference ?? null,
        computation: {
          totalWht: recalculated,
          vendors: schedule.vendors,
        },
        currentStep: 8,
        completedSteps,
        frozen: true,
        frozenAt: submittedAt,
      },
      update: {
        amountDue: new Decimal(recalculated),
        totalPayable: new Decimal(recalculated),
        submittedAt,
        documentUrl: params.documentUrl ?? undefined,
        evidenceVaultId: params.evidenceVaultId ?? undefined,
        receiptUrl: params.receiptUrl ?? undefined,
        status,
        submissionReference: params.submissionReference ?? undefined,
        computation: {
          totalWht: recalculated,
          vendors: schedule.vendors,
        },
        currentStep: 8,
        completedSteps,
        frozen: true,
        frozenAt: submittedAt,
      },
    });

    await prisma.filingTimelineEvent.create({
      data: {
        taxPayableId: taxPayable.id,
        event: WORKSPACE_TIMELINE_EVENTS.SUBMITTED,
        description: "WHT return recorded",
        eventDate: submittedAt,
      },
    });

    return {
      id: taxPayable.id,
      submissionDate: submittedAt,
      period: `${params.periodYear}-${String(params.periodMonth).padStart(2, "0")}`,
      amount: recalculated,
      status: "submitted",
      completionPercent: completionPercentFromStep(8),
    };
  },
};
