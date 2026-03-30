import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../config/database";
import { FILING_TIMELINE_EVENTS } from "../constants/filings";

/**
 * Creates/updates a tax_payables row for tax types without dedicated filing flows (e.g. CIT, PAYE).
 */
export const genericTaxFilingService = {
  async submit(
    userId: string,
    taxType: string,
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
          taxType,
          periodYear: params.periodYear,
          periodMonth: params.periodMonth,
        },
      },
      create: {
        userId,
        taxType,
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
        receiptUrl: params.receiptUrl ?? null,
        stateOfOperation: params.stateOfOperation ?? null,
        vatRegistrationNumber: params.vatRegistrationNumber ?? null,
      },
      update: {
        amountDue: new Decimal(params.amount),
        totalPayable: new Decimal(params.amount),
        submittedAt,
        documentUrl: params.documentUrl ?? undefined,
        evidenceVaultId: params.evidenceVaultId ?? undefined,
        receiptUrl: params.receiptUrl ?? undefined,
        stateOfOperation: params.stateOfOperation ?? undefined,
        vatRegistrationNumber: params.vatRegistrationNumber ?? undefined,
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
      taxType,
      status,
    };
  },
};
