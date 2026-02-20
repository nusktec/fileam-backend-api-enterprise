import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { FILING_TIMELINE_EVENTS } from "../../constants/filings";
import { VAT_FILING_DAY } from "../../constants/taxPayable";

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
    _whtType?: string
  ) {
    const vendors = await prisma.vendorPayment.findMany({
      where: { userId, periodYear, periodMonth },
      orderBy: { vendorName: "asc" },
    });
    const lines = vendors.map((v) => ({
      vendorName: v.vendorName,
      description: v.description,
      category: v.category,
      grossAmount: decimalToNumber(v.grossAmount),
      whtRate: decimalToNumber(v.whtRate),
      whtDeducted: decimalToNumber(v.whtDeducted),
    }));
    const totalWht = lines.reduce((s, l) => s + l.whtDeducted, 0);
    const dueDate = getFilingDueDate(periodYear, periodMonth);
    return {
      periodYear,
      periodMonth,
      periodLabel: `${new Date(periodYear, periodMonth - 1).toLocaleString("default", { month: "long" })} ${periodYear}`,
      whtType: _whtType ?? "Contract of sale (5%)",
      vendors: lines,
      totalWht,
      dueDate,
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
    }
  ) {
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
        whtType: params.whtType ?? null,
        status: "draft",
      },
      update: {
        whtType: params.whtType ?? undefined,
      },
    });

    await prisma.whtScheduleLine.deleteMany({ where: { filingDraftId: draft.id } });
    if (params.lines?.length) {
      await prisma.whtScheduleLine.createMany({
        data: params.lines.map((l) => ({
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

    const linesOut = await prisma.whtScheduleLine.findMany({
      where: { filingDraftId: draft.id },
    });
    return {
      id: draft.id,
      periodYear: draft.periodYear,
      periodMonth: draft.periodMonth,
      whtType: draft.whtType,
      lines: linesOut.map((l) => ({
        id: l.id,
        vendorName: l.vendorName,
        description: l.description,
        category: l.category,
        grossAmount: decimalToNumber(l.grossAmount),
        whtRate: decimalToNumber(l.whtRate),
        whtDeducted: decimalToNumber(l.whtDeducted),
      })),
      totalWht: linesOut.reduce((s, l) => s + decimalToNumber(l.whtDeducted), 0),
    };
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
    }
  ) {
    const filingDueDate = params.dueDate instanceof Date ? params.dueDate : new Date(params.dueDate);
    const submittedAt = new Date();
    const status = params.paymentStatus === "paid" ? "paid" : "pending";

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
        amountDue: new Decimal(params.totalWht),
        penalties: new Decimal(0),
        totalPayable: new Decimal(params.totalWht),
        filingDueDate,
        status,
        submittedAt,
        documentUrl: params.documentUrl ?? null,
        evidenceVaultId: params.evidenceVaultId ?? null,
        receiptUrl: params.receiptUrl ?? null,
      },
      update: {
        amountDue: new Decimal(params.totalWht),
        totalPayable: new Decimal(params.totalWht),
        submittedAt,
        documentUrl: params.documentUrl ?? undefined,
        evidenceVaultId: params.evidenceVaultId ?? undefined,
        receiptUrl: params.receiptUrl ?? undefined,
        status,
      },
    });

    const draft = await prisma.filingDraft.findUnique({
      where: {
        userId_taxType_periodYear_periodMonth: {
          userId,
          taxType: "WHT",
          periodYear: params.periodYear,
          periodMonth: params.periodMonth,
        },
      },
      include: { whtScheduleLines: true },
    });
    const vendorsCount = draft?.whtScheduleLines?.length ?? 0;

    const timelineData: Array<{ taxPayableId: string; event: string; description: string; eventDate: Date }> = [
      { taxPayableId: taxPayable.id, event: FILING_TIMELINE_EVENTS.DRAFT_CREATED, description: "Draft created", eventDate: submittedAt },
      { taxPayableId: taxPayable.id, event: FILING_TIMELINE_EVENTS.REVIEWED_VALIDATED, description: "Reviewed & validated", eventDate: submittedAt },
      { taxPayableId: taxPayable.id, event: FILING_TIMELINE_EVENTS.SUBMITTED_TO_FIRS, description: "Submitted to FIRS", eventDate: submittedAt },
    ];
    if (params.paymentStatus === "paid") {
      timelineData.push({ taxPayableId: taxPayable.id, event: FILING_TIMELINE_EVENTS.PAYMENT_CONFIRMED, description: "Payment confirmed", eventDate: submittedAt });
    }
    await prisma.filingTimelineEvent.createMany({ data: timelineData });

    return {
      id: taxPayable.id,
      submissionDate: submittedAt,
      period: `${params.periodYear}-${String(params.periodMonth).padStart(2, "0")}`,
      totalWht: params.totalWht,
      vendorsCount,
      status,
    };
  },
};
