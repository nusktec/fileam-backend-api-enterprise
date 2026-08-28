import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { taxComputationService } from "./taxComputationService";
import { FILING_TIMELINE_EVENTS } from "../../constants/filings";
import { WORKSPACE_TIMELINE_EVENTS } from "../../constants/filingWorkspace";
import { completionPercentFromStep } from "../../constants/filingWorkspace";
import { getVatInputBroughtForward, copyCarryForwardOnSubmit } from "./filingCarryForwardService";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";

export const vatFilingService = {
  async getCalculation(userId: string, year: number, month: number) {
    const [computation, draft, existing, priorCredit] = await Promise.all([
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
      prisma.taxPayable.findUnique({
        where: {
          userId_taxType_periodYear_periodMonth: {
            userId,
            taxType: "VAT",
            periodYear: year,
            periodMonth: month,
          },
        },
      }),
      getVatInputBroughtForward(userId, year, month),
    ]);

    if (existing?.frozen && existing.computation) {
      const frozen = existing.computation as {
        outputVat?: number;
        inputVatClaimable?: number;
        netVatPayable?: number;
        inputVatBroughtForward?: number;
      };
      return {
        period: computation.period,
        stateOfOperation:
          existing.stateOfOperation ?? draft?.stateOfOperation ?? null,
        vatRegistrationNumber:
          existing.vatRegistrationNumber ?? draft?.vatRegistrationNumber ?? null,
        outputVat: frozen.outputVat ?? 0,
        inputVatClaimable: frozen.inputVatClaimable ?? 0,
        netVatPayable: frozen.netVatPayable ?? Number(existing.totalPayable),
        inputVatBroughtForward: frozen.inputVatBroughtForward ?? 0,
        frozen: true,
        alreadyFiled: existing.submittedAt != null,
        filingId: existing.submittedAt != null ? existing.id : null,
        nilReturn: (frozen.netVatPayable ?? 0) === 0,
        breakdown: {
          outputVat: frozen.outputVat ?? 0,
          inputVatClaimable: frozen.inputVatClaimable ?? 0,
          netVatPayable: frozen.netVatPayable ?? Number(existing.totalPayable),
        },
      };
    }

    const inputVatBroughtForward = priorCredit.inputVatBroughtForward;
    const inputVatClaimable = normalizeMoneyAmount(
      computation.vat.inputVatClaimable + inputVatBroughtForward,
    );
    const netVatPayable = normalizeMoneyAmount(
      computation.vat.outputVat - inputVatClaimable,
    );

    return {
      period: computation.period,
      stateOfOperation: draft?.stateOfOperation ?? null,
      vatRegistrationNumber: draft?.vatRegistrationNumber ?? null,
      outputVat: computation.vat.outputVat,
      inputVatClaimable,
      netVatPayable,
      inputVatBroughtForward,
      alreadyFiled: existing?.submittedAt != null,
      filingId: existing?.submittedAt != null ? existing.id : null,
      nilReturn: netVatPayable === 0,
      breakdown: {
        outputVat: computation.vat.outputVat,
        inputVatClaimable,
        netVatPayable,
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

    const { filingWorkspaceService } = await import("./filingWorkspaceService");
    await filingWorkspaceService.ensureDraftWorkspace(
      userId,
      "VAT",
      params.periodYear,
      params.periodMonth,
    );

    if (params.stateOfOperation || params.vatRegistrationNumber) {
      await prisma.taxPayable.updateMany({
        where: {
          userId,
          taxType: "VAT",
          periodYear: params.periodYear,
          periodMonth: params.periodMonth,
        },
        data: {
          stateOfOperation: params.stateOfOperation ?? undefined,
          vatRegistrationNumber: params.vatRegistrationNumber ?? undefined,
        },
      });
    }

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
      submissionReference?: string;
      computation?: Record<string, unknown>;
    },
  ) {
    const filingDueDate =
      params.dueDate instanceof Date
        ? params.dueDate
        : new Date(params.dueDate);
    const submittedAt = new Date();
    const status = params.paymentStatus === "paid" ? "paid" : "pending";
    const completedSteps = Array.from({ length: 8 }, (_, i) => i + 1);
    const calc = await this.getCalculation(userId, params.periodYear, params.periodMonth);
    const comp = calc as {
      outputVat?: number;
      inputVatClaimable?: number;
      netVatPayable?: number;
      inputVatBroughtForward?: number;
      breakdown?: {
        outputVat?: number;
        inputVatClaimable?: number;
        netVatPayable?: number;
      };
    };
    const computationPayload = (params.computation ?? comp) as typeof comp;

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
        submissionReference: params.submissionReference ?? null,
        computation: {
          outputVat:
            computationPayload.outputVat ?? computationPayload.breakdown?.outputVat,
          inputVatClaimable:
            computationPayload.inputVatClaimable ??
            computationPayload.breakdown?.inputVatClaimable,
          netVatPayable:
            computationPayload.netVatPayable ??
            computationPayload.breakdown?.netVatPayable,
          inputVatBroughtForward: computationPayload.inputVatBroughtForward ?? 0,
        },
        currentStep: 8,
        completedSteps,
        frozen: true,
        frozenAt: submittedAt,
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
        submissionReference: params.submissionReference ?? undefined,
        computation: {
          outputVat:
            computationPayload.outputVat ?? computationPayload.breakdown?.outputVat,
          inputVatClaimable:
            computationPayload.inputVatClaimable ??
            computationPayload.breakdown?.inputVatClaimable,
          netVatPayable:
            computationPayload.netVatPayable ??
            computationPayload.breakdown?.netVatPayable,
          inputVatBroughtForward: computationPayload.inputVatBroughtForward ?? 0,
        },
        currentStep: 8,
        completedSteps,
        frozen: true,
        frozenAt: submittedAt,
      },
    });

    await copyCarryForwardOnSubmit(
      userId,
      "VAT",
      params.periodYear,
      params.periodMonth,
      taxPayable.computation as Record<string, unknown>,
    );

    await prisma.filingTimelineEvent.create({
      data: {
        taxPayableId: taxPayable.id,
        event: WORKSPACE_TIMELINE_EVENTS.SUBMITTED,
        description: "VAT return recorded",
        eventDate: submittedAt,
      },
    });

    return {
      id: taxPayable.id,
      submissionDate: submittedAt,
      period: `${params.periodYear}-${String(params.periodMonth).padStart(2, "0")}`,
      amount: params.amount,
      status: "submitted",
      completionPercent: completionPercentFromStep(8),
    };
  },
};
