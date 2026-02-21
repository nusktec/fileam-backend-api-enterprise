import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { taxComputationService } from "./taxComputationService";
import { FILING_TIMELINE_EVENTS } from "../../constants/filings";

export const vatFilingService = {
  async getCalculation(userId: string, year: number, month: number) {
    const [computation, draft] = await Promise.all([
      taxComputationService.getForPeriod(userId, year, month),
      prisma.filingDraft.findUnique({
        where: {
          userId_taxType_periodYear_periodMonth: {
            userId,
            taxType: "VAT",
            periodYear: year,
            periodMonth: month,
          },
        },
      }),
    ]);
    return {
      period: computation.period,
      stateOfOperation: draft?.stateOfOperation ?? null,
      vatRegistrationNumber: draft?.vatRegistrationNumber ?? null,
      outputVat: computation.vat.outputVat,
      inputVatClaimable: computation.vat.inputVatClaimable,
      netVatPayable: computation.vat.netVatPayable,
      breakdown: {
        outputVat: computation.vat.outputVat,
        inputVatClaimable: computation.vat.inputVatClaimable,
        netVatPayable: computation.vat.netVatPayable,
      },
    };
  },

  async createOrUpdateDraft(
    userId: string,
    params: {
      periodYear: number;
      periodMonth: number;
      stateOfOperation?: string;
      vatRegistrationNumber?: string;
    },
  ) {
    const draft = await prisma.filingDraft.upsert({
      where: {
        userId_taxType_periodYear_periodMonth: {
          userId,
          taxType: "VAT",
          periodYear: params.periodYear,
          periodMonth: params.periodMonth,
        },
      },
      create: {
        userId,
        taxType: "VAT",
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
        stateOfOperation: params.stateOfOperation ?? null,
        vatRegistrationNumber: params.vatRegistrationNumber ?? null,
        status: "draft",
      },
      update: {
        stateOfOperation: params.stateOfOperation ?? undefined,
        vatRegistrationNumber: params.vatRegistrationNumber ?? undefined,
      },
    });
    return draft;
  },

  async submit(
    userId: string,
    params: {
      periodYear: number;
      periodMonth: number;
      amount: number;
      dueDate: Date;
      paymentStatus: "paid" | "not_paid";
      receiptUrl?: string;
      documentUrl?: string;
      evidenceVaultId?: string;
      stateOfOperation?: string;
      vatRegistrationNumber?: string;
    },
  ) {
    const filingDueDate =
      params.dueDate instanceof Date
        ? params.dueDate
        : new Date(params.dueDate);
    const submittedAt = new Date();
    const status = params.paymentStatus === "paid" ? "paid" : "pending";

    const taxPayable = await prisma.taxPayable.upsert({
      where: {
        userId_taxType_periodYear_periodMonth: {
          userId,
          taxType: "VAT",
          periodYear: params.periodYear,
          periodMonth: params.periodMonth,
        },
      },
      create: {
        userId,
        taxType: "VAT",
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
        amountDue: new Decimal(params.amount),
        penalties: new Decimal(0),
        totalPayable: new Decimal(params.amount),
        filingDueDate,
        status,
        submittedAt,
        documentUrl: params.documentUrl ?? null,
        evidenceVaultId: params.evidenceVaultId ?? null,
        stateOfOperation: params.stateOfOperation ?? null,
        vatRegistrationNumber: params.vatRegistrationNumber ?? null,
        receiptUrl: params.receiptUrl ?? null,
      },
      update: {
        amountDue: new Decimal(params.amount),
        totalPayable: new Decimal(params.amount),
        submittedAt,
        documentUrl: params.documentUrl ?? undefined,
        evidenceVaultId: params.evidenceVaultId ?? undefined,
        stateOfOperation: params.stateOfOperation ?? undefined,
        vatRegistrationNumber: params.vatRegistrationNumber ?? undefined,
        receiptUrl: params.receiptUrl ?? undefined,
        status,
      },
    });

    const timelineData: Array<{
      taxPayableId: string;
      event: string;
      description: string;
      eventDate: Date;
    }> = [
      {
        taxPayableId: taxPayable.id,
        event: FILING_TIMELINE_EVENTS.DRAFT_CREATED,
        description: "Draft created",
        eventDate: submittedAt,
      },
      {
        taxPayableId: taxPayable.id,
        event: FILING_TIMELINE_EVENTS.REVIEWED_VALIDATED,
        description: "Reviewed & validated",
        eventDate: submittedAt,
      },
      {
        taxPayableId: taxPayable.id,
        event: FILING_TIMELINE_EVENTS.SUBMITTED_TO_FIRS,
        description: "Submitted to FIRS",
        eventDate: submittedAt,
      },
    ];
    if (params.paymentStatus === "paid") {
      timelineData.push({
        taxPayableId: taxPayable.id,
        event: FILING_TIMELINE_EVENTS.PAYMENT_CONFIRMED,
        description: "Payment confirmed",
        eventDate: submittedAt,
      });
    }
    await prisma.filingTimelineEvent.createMany({ data: timelineData });

    return {
      id: taxPayable.id,
      submissionDate: submittedAt,
      period: `${params.periodYear}-${String(params.periodMonth).padStart(2, "0")}`,
      amount: params.amount,
      status,
    };
  },
};
