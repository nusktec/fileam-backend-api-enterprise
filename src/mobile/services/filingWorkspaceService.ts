import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import {
  citDueDateForYear,
  CIT_PERIOD_MONTH,
} from "../../constants/citFiling";
import {
  completionPercentFromStep,
  defaultWorkspacePeriod,
  taxTypeFromPath,
  WORKSPACE_TIMELINE_EVENTS,
  type CitDraftInputs,
  type PitDraftInputs,
  type WorkspaceTaxPath,
  type WorkspaceTaxType,
} from "../../constants/filingWorkspace";
import {
  pitDueDateForYear,
  PIT_PERIOD_MONTH,
} from "../../constants/pitFiling";
import { VAT_FILING_DAY } from "../../constants/taxPayable";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { citFilingService } from "./citFilingService";
import {
  generateFilingDocuments,
  refreshDocumentUrl,
} from "./filingDocumentService";
import { pitFilingService } from "./pitFilingService";
import { runTaxGptValidation } from "./taxGptValidationService";
import { vatFilingService } from "./vatFilingService";
import { whtFilingService } from "./whtFilingService";

function d(v: Decimal | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

function periodLabel(taxType: string, year: number, month: number): string {
  const tt = taxType.trim().toUpperCase();
  if (tt === "PIT" || tt === "CIT") return String(year);
  return `${new Date(year, month - 1).toLocaleString("default", { month: "long" })} ${year}`;
}

function monthlyDueDate(year: number, month: number): Date {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(nextYear, nextMonth - 1, VAT_FILING_DAY);
}

function resolveDueDate(
  taxType: WorkspaceTaxType,
  year: number,
  month: number,
): string {
  if (taxType === "PIT") return pitDueDateForYear(year);
  if (taxType === "CIT") return citDueDateForYear(year);
  const dt = monthlyDueDate(year, month);
  return dt.toISOString().slice(0, 10);
}

function deriveWorkspaceStatus(row: {
  status: string;
  submittedAt: Date | null;
  filingDueDate: Date;
}): "pending" | "submitted" | "paid" | "overdue" {
  if (row.status === "paid" || row.status === "overpaid") return "paid";
  if (row.submittedAt) {
    return row.status === "paid" ? "paid" : "submitted";
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(row.filingDueDate);
  due.setHours(0, 0, 0, 0);
  if (due < today) return "overdue";
  return "pending";
}

async function appendTimeline(
  taxPayableId: string,
  event: string,
  description?: string,
): Promise<void> {
  await prisma.filingTimelineEvent.create({
    data: {
      taxPayableId,
      event,
      description,
      eventDate: new Date(),
    },
  });
}

async function resolveLiveAmountAndComputation(
  userId: string,
  taxType: WorkspaceTaxType,
  year: number,
  month: number,
): Promise<{ amount: number; computation: Record<string, unknown> }> {
  if (taxType === "VAT") {
    const calc = await vatFilingService.getCalculation(userId, year, month);
    return {
      amount: normalizeMoneyAmount(calc.netVatPayable),
      computation: {
        outputVat: calc.outputVat,
        inputVatClaimable: calc.inputVatClaimable,
        netVatPayable: calc.netVatPayable,
        inputVatBroughtForward: calc.inputVatBroughtForward ?? 0,
      },
    };
  }
  if (taxType === "WHT") {
    const sched = await whtFilingService.getSchedule(userId, year, month);
    return {
      amount: normalizeMoneyAmount(sched.totalWht),
      computation: { totalWht: sched.totalWht, vendors: sched.vendors },
    };
  }
  if (taxType === "PIT") {
    const calc = await pitFilingService.getCalculation(userId, year);
    const comp = calc.computation as Record<string, unknown>;
    return {
      amount: normalizeMoneyAmount(Number(comp.remainingPayable ?? 0)),
      computation: comp,
    };
  }
  const calc = await citFilingService.getCalculation(userId, year);
  const comp = calc.computation as unknown as Record<string, unknown>;
  return {
    amount: normalizeMoneyAmount(Number(comp.citPayable ?? 0)),
    computation: comp,
  };
}

function mapDocuments(row: {
  documents: Array<{
    documentId: string;
    title: string;
    subtitle: string | null;
    status: string;
    contentType: string;
    fileUrl: string | null;
    fileName: string | null;
    bytes: number | null;
    source: string;
  }>;
}) {
  return row.documents.map((doc) => ({
    id: doc.documentId,
    title: doc.title,
    subtitle: doc.subtitle ?? undefined,
    status: doc.status,
    contentType: doc.contentType,
    fileUrl: doc.fileUrl,
    fileName: doc.fileName ?? undefined,
    bytes: doc.bytes ?? undefined,
    source: doc.source,
  }));
}

function mapWorkspaceRow(
  row: Awaited<ReturnType<typeof loadWorkspaceRow>>,
  readOnly = false,
) {
  const taxType = row.taxType.trim().toUpperCase() as WorkspaceTaxType;
  const completedSteps = parseJsonArray<number>(row.completedSteps);
  const reviewedDocumentIds = parseJsonArray<string>(row.reviewedDocumentIds);
  const status = deriveWorkspaceStatus(row);
  const amount = d(row.totalPayable);
  const computation =
    row.computation && typeof row.computation === "object"
      ? (row.computation as Record<string, unknown>)
      : null;
  const draftInputs =
    row.draftInputs && typeof row.draftInputs === "object"
      ? (row.draftInputs as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    taxType,
    currentStep: row.currentStep,
    completedSteps,
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    status,
    completionPercent: completionPercentFromStep(row.currentStep),
    amount,
    dueDate: row.filingDueDate.toISOString().slice(0, 10),
    frozen: row.frozen,
    frozenAt: row.frozenAt?.toISOString() ?? null,
    booksChangedSinceFreeze: row.booksChangedSinceFreeze,
    acknowledgedGaps: row.acknowledgedGaps,
    reviewedDocumentIds,
    submissionReference: row.submissionReference ?? "",
    rrr: row.rrr ?? "",
    submissionProofName: row.submissionProofName,
    submissionProofUrl: row.submissionProofUrl,
    paymentReceiptName: row.paymentReceiptName,
    paymentReceiptUrl: row.paymentReceiptUrl,
    formsGenerated: row.formsGenerated,
    packageUrl: row.packageUrl,
    validation: row.validation ?? null,
    documents: mapDocuments(row),
    draftInputs,
    computation,
    readOnly: readOnly || row.submittedAt != null,
    submittedAt: row.submittedAt?.toISOString(),
    submittedDate: row.submittedAt?.toISOString(),
  };
}

async function loadWorkspaceRow(id: string, userId: string) {
  return prisma.taxPayable.findFirstOrThrow({
    where: { id, userId },
    include: { documents: { orderBy: { documentId: "asc" } } },
  });
}

async function findWorkspace(
  userId: string,
  taxType: WorkspaceTaxType,
  year: number,
  month: number,
) {
  return prisma.taxPayable.findUnique({
    where: {
      userId_taxType_periodYear_periodMonth: {
        userId,
        taxType,
        periodYear: year,
        periodMonth: month,
      },
    },
    include: { documents: { orderBy: { documentId: "asc" } } },
  });
}

async function clearGeneratedDocuments(taxPayableId: string): Promise<void> {
  await prisma.filingDocument.deleteMany({ where: { taxPayableId } });
  await prisma.taxPayable.update({
    where: { id: taxPayableId },
    data: {
      formsGenerated: false,
      packageUrl: null,
      packageExpiresAt: null,
    },
  });
}

export const filingWorkspaceService = {
  async getOrCreate(
    userId: string,
    path: WorkspaceTaxPath,
    query: { periodYear?: number; periodMonth?: number },
  ) {
    const taxType = taxTypeFromPath(path);
    const defaults = defaultWorkspacePeriod(taxType);
    const periodYear = query.periodYear ?? defaults.periodYear;
    let periodMonth = query.periodMonth ?? defaults.periodMonth;
    if (taxType === "PIT" || taxType === "CIT") periodMonth = 12;

    let row = await findWorkspace(userId, taxType, periodYear, periodMonth);
    if (row?.submittedAt) {
      return mapWorkspaceRow(row, true);
    }

    if (!row) {
      const live = await resolveLiveAmountAndComputation(
        userId,
        taxType,
        periodYear,
        periodMonth,
      );
      const due = resolveDueDate(taxType, periodYear, periodMonth);
      row = await prisma.taxPayable.create({
        data: {
          userId,
          taxType,
          periodYear,
          periodMonth,
          amountDue: new Decimal(live.amount),
          totalPayable: new Decimal(live.amount),
          penalties: new Decimal(0),
          filingDueDate: new Date(due),
          status: "pending",
          currentStep: 1,
          completedSteps: [],
          computation: live.computation as Prisma.InputJsonValue,
        },
        include: { documents: true },
      });
      await appendTimeline(
        row!.id,
        WORKSPACE_TIMELINE_EVENTS.WORKSPACE_STARTED,
        `${taxType} workspace for ${periodLabel(taxType, periodYear, periodMonth)}`,
      );
    }

    return mapWorkspaceRow(row);
  },

  async update(
    userId: string,
    path: WorkspaceTaxPath,
    body: Record<string, unknown>,
  ) {
    const id = String(body.id ?? "");
    if (!id) {
      throw new HttpReplyError(400, "Workspace id is required.", null, "VALIDATION_ERROR");
    }

    const existing = await loadWorkspaceRow(id, userId);
    if (existing.submittedAt) {
      throw new HttpReplyError(
        400,
        "Submitted filings cannot be edited.",
        null,
        "VALIDATION_ERROR",
      );
    }

    const completedSteps = parseJsonArray<number>(existing.completedSteps);
    const submittedStepDone = completedSteps.includes(8);

    const updateData: Record<string, unknown> = {};

    if (body.periodYear != null || body.periodMonth != null) {
      if (submittedStepDone) {
        throw new HttpReplyError(
          400,
          "Cannot change period after submit.",
          null,
          "VALIDATION_ERROR",
        );
      }
      const taxType = existing.taxType.trim().toUpperCase() as WorkspaceTaxType;
      const year = Number(body.periodYear ?? existing.periodYear);
      let month = Number(body.periodMonth ?? existing.periodMonth);
      if (taxType === "PIT" || taxType === "CIT") month = 12;

      if (year !== existing.periodYear || month !== existing.periodMonth) {
        const live = await resolveLiveAmountAndComputation(
          userId,
          taxType,
          year,
          month,
        );
        updateData.periodYear = year;
        updateData.periodMonth = month;
        updateData.filingDueDate = new Date(resolveDueDate(taxType, year, month));
        updateData.frozen = false;
        updateData.frozenAt = null;
        updateData.validation = null;
        updateData.currentStep = 1;
        updateData.completedSteps = [];
        updateData.amountDue = new Decimal(live.amount);
        updateData.totalPayable = new Decimal(live.amount);
        updateData.computation = live.computation as Prisma.InputJsonValue;
        await clearGeneratedDocuments(existing.id);
      }
    }

    if (body.currentStep != null) updateData.currentStep = Number(body.currentStep);
    if (body.completedSteps != null) updateData.completedSteps = body.completedSteps;
    if (body.acknowledgedGaps != null) {
      updateData.acknowledgedGaps = Boolean(body.acknowledgedGaps);
    }
    if (body.reviewedDocumentIds != null) {
      updateData.reviewedDocumentIds = body.reviewedDocumentIds;
    }
    if (body.submissionReference != null) {
      updateData.submissionReference = String(body.submissionReference);
    }
    if (body.rrr != null) updateData.rrr = String(body.rrr);
    if (body.submissionProofName != null) {
      updateData.submissionProofName = String(body.submissionProofName);
    }
    if (body.submissionProofUrl != null) {
      updateData.submissionProofUrl = String(body.submissionProofUrl);
    }
    if (body.paymentReceiptName != null) {
      updateData.paymentReceiptName = String(body.paymentReceiptName);
    }
    if (body.paymentReceiptUrl != null) {
      updateData.paymentReceiptUrl = String(body.paymentReceiptUrl);
    }
    if (body.portalOpenedAt != null) {
      updateData.portalOpenedAt = new Date(String(body.portalOpenedAt));
    }

    await prisma.taxPayable.update({ where: { id }, data: updateData });
    const row = await loadWorkspaceRow(id, userId);
    return mapWorkspaceRow(row);
  },

  async confirmComputation(
    userId: string,
    path: WorkspaceTaxPath,
    body: { periodYear: number; periodMonth?: number },
  ) {
    const taxType = taxTypeFromPath(path);
    const periodYear = Number(body.periodYear);
    let periodMonth = Number(body.periodMonth ?? 12);
    if (taxType === "PIT" || taxType === "CIT") periodMonth = 12;

    const row = await findWorkspace(userId, taxType, periodYear, periodMonth);
    if (!row) {
      throw new HttpReplyError(404, "Workspace not found.", null, "NOT_FOUND");
    }
    if (row.submittedAt) {
      throw new HttpReplyError(
        400,
        "Computation is already locked on a submitted return.",
        null,
        "VALIDATION_ERROR",
      );
    }

    const live = await resolveLiveAmountAndComputation(
      userId,
      taxType,
      periodYear,
      periodMonth,
    );

    const completedSteps = Array.from(
      new Set([...parseJsonArray<number>(row.completedSteps), 1]),
    ).sort((a, b) => a - b);

    await clearGeneratedDocuments(row.id);

    const updated = await prisma.taxPayable.update({
      where: { id: row.id },
      data: {
        frozen: true,
        frozenAt: new Date(),
        computation: live.computation as Prisma.InputJsonValue,
        amountDue: new Decimal(live.amount),
        totalPayable: new Decimal(live.amount),
        currentStep: Math.max(row.currentStep, 2),
        completedSteps,
        booksChangedSinceFreeze: false,
        validation: Prisma.DbNull,
      },
      include: { documents: true },
    });

    await appendTimeline(
      row.id,
      WORKSPACE_TIMELINE_EVENTS.COMPUTATION_CONFIRMED,
      "Step 1 computation confirmed and frozen.",
    );

    return mapWorkspaceRow(updated);
  },

  async validate(
    userId: string,
    path: WorkspaceTaxPath,
    body: { periodYear: number; periodMonth?: number },
  ) {
    const taxType = taxTypeFromPath(path);
    const periodYear = Number(body.periodYear);
    let periodMonth = Number(body.periodMonth ?? 12);
    if (taxType === "PIT" || taxType === "CIT") periodMonth = 12;

    const row = await findWorkspace(userId, taxType, periodYear, periodMonth);
    if (!row) {
      throw new HttpReplyError(404, "Workspace not found.", null, "NOT_FOUND");
    }

    const computation =
      row.computation && typeof row.computation === "object"
        ? (row.computation as Record<string, unknown>)
        : null;

    let validation;
    try {
      validation = await runTaxGptValidation({
        taxType,
        periodYear,
        periodMonth,
        computation,
        draftInputs:
          row.draftInputs && typeof row.draftInputs === "object"
            ? (row.draftInputs as Record<string, unknown>)
            : null,
      });
    } catch (e) {
      throw new HttpReplyError(
        400,
        e instanceof Error ? e.message : "TaxGPT validation failed.",
        null,
        "VALIDATION_ERROR",
      );
    }

    const completedSteps = Array.from(
      new Set([...parseJsonArray<number>(row.completedSteps), 2]),
    ).sort((a, b) => a - b);

    const updated = await prisma.taxPayable.update({
      where: { id: row.id },
      data: {
        validation,
        currentStep: Math.max(row.currentStep, 3),
        completedSteps,
      },
      include: { documents: true },
    });

    await appendTimeline(
      row.id,
      WORKSPACE_TIMELINE_EVENTS.TAXGPT_VALIDATED,
      validation.summary,
    );

    return mapWorkspaceRow(updated);
  },

  async generateDocuments(
    userId: string,
    path: WorkspaceTaxPath,
    body: { periodYear: number; periodMonth?: number },
  ) {
    const taxType = taxTypeFromPath(path);
    const periodYear = Number(body.periodYear);
    let periodMonth = Number(body.periodMonth ?? 12);
    if (taxType === "PIT" || taxType === "CIT") periodMonth = 12;

    let row = await findWorkspace(userId, taxType, periodYear, periodMonth);
    if (!row) {
      throw new HttpReplyError(404, "Workspace not found.", null, "NOT_FOUND");
    }

    if (!row.frozen) {
      await this.confirmComputation(userId, path, { periodYear, periodMonth });
      row = (await findWorkspace(userId, taxType, periodYear, periodMonth))!;
    }

    const amount = d(row.totalPayable);
    const computation =
      row.computation && typeof row.computation === "object"
        ? (row.computation as Record<string, unknown>)
        : null;

    const generated = await generateFilingDocuments({
      userId,
      taxType,
      periodYear,
      periodMonth,
      periodLabel: periodLabel(taxType, periodYear, periodMonth),
      dueDate: row.filingDueDate.toISOString().slice(0, 10),
      amount,
      computation,
      paymentReceiptUrl: row.paymentReceiptUrl,
    });

    await prisma.filingDocument.deleteMany({ where: { taxPayableId: row.id } });
    if (generated.documents.length) {
      await prisma.filingDocument.createMany({
        data: generated.documents.map((doc) => ({
          taxPayableId: row!.id,
          documentId: doc.id,
          title: doc.title,
          subtitle: doc.subtitle ?? null,
          status: doc.status,
          contentType: doc.contentType,
          fileUrl: doc.fileUrl,
          fileKey: doc.fileKey ?? null,
          fileName: doc.fileName,
          bytes: doc.bytes,
          source: doc.source,
          expiresAt: generated.packageExpiresAt,
        })),
      });
    }

    const completedSteps = Array.from(
      new Set([...parseJsonArray<number>(row.completedSteps), 4]),
    ).sort((a, b) => a - b);

    const updated = await prisma.taxPayable.update({
      where: { id: row.id },
      data: {
        formsGenerated: true,
        packageUrl: generated.packageUrl,
        packageExpiresAt: generated.packageExpiresAt,
        currentStep: Math.max(row.currentStep, 5),
        completedSteps,
      },
      include: { documents: { orderBy: { documentId: "asc" } } },
    });

    await appendTimeline(
      row.id,
      WORKSPACE_TIMELINE_EVENTS.DOCUMENTS_GENERATED,
      `${generated.documents.filter((d) => d.status === "ready").length} documents generated.`,
    );

    return {
      generatedAt: new Date().toISOString(),
      packageUrl: generated.packageUrl,
      packageExpiresAt: generated.packageExpiresAt.toISOString(),
      documents: mapDocuments(updated),
      workspace: mapWorkspaceRow(updated),
    };
  },

  async getDocumentUrl(
    userId: string,
    path: WorkspaceTaxPath,
    documentId: string,
    query: { periodYear?: number; periodMonth?: number },
  ) {
    const taxType = taxTypeFromPath(path);
    const defaults = defaultWorkspacePeriod(taxType);
    const periodYear = query.periodYear ?? defaults.periodYear;
    let periodMonth = query.periodMonth ?? defaults.periodMonth;
    if (taxType === "PIT" || taxType === "CIT") periodMonth = 12;

    const row = await findWorkspace(userId, taxType, periodYear, periodMonth);
    if (!row) {
      throw new HttpReplyError(404, "Workspace not found.", null, "NOT_FOUND");
    }

    const doc = await prisma.filingDocument.findUnique({
      where: {
        taxPayableId_documentId: {
          taxPayableId: row.id,
          documentId,
        },
      },
    });
    if (!doc) {
      throw new HttpReplyError(404, "Document not found.", null, "NOT_FOUND");
    }

    let fileUrl = doc.fileUrl;
    if (doc.fileKey) {
      fileUrl = (await refreshDocumentUrl(doc.fileKey)) ?? fileUrl;
    }

    return { documentId, fileUrl, fileName: doc.fileName };
  },

  async getPackage(
    userId: string,
    path: WorkspaceTaxPath,
    query: { periodYear?: number; periodMonth?: number },
  ) {
    const taxType = taxTypeFromPath(path);
    const defaults = defaultWorkspacePeriod(taxType);
    const periodYear = query.periodYear ?? defaults.periodYear;
    let periodMonth = query.periodMonth ?? defaults.periodMonth;
    if (taxType === "PIT" || taxType === "CIT") periodMonth = 12;

    const row = await findWorkspace(userId, taxType, periodYear, periodMonth);
    if (!row?.packageUrl) {
      throw new HttpReplyError(404, "Package not found.", null, "NOT_FOUND");
    }

    return {
      packageUrl: row.packageUrl,
      expiresAt: row.packageExpiresAt?.toISOString() ?? null,
    };
  },

  async savePitDraft(userId: string, body: PitDraftInputs & { periodYear: number }) {
    const periodYear = Number(body.periodYear);
    const draftInputs: PitDraftInputs = {
      incomeOverrides: body.incomeOverrides,
      payerFeesIncludedInSales: body.payerFeesIncludedInSales,
      reliefs: body.reliefs,
      incomeReviewed: body.incomeReviewed,
      reliefsReviewed: body.reliefsReviewed,
    };

    await this.ensureDraftWorkspace(userId, "PIT", periodYear, PIT_PERIOD_MONTH);
    await prisma.taxPayable.update({
      where: {
        userId_taxType_periodYear_periodMonth: {
          userId,
          taxType: "PIT",
          periodYear,
          periodMonth: PIT_PERIOD_MONTH,
        },
      },
      data: { draftInputs: draftInputs as Prisma.InputJsonValue },
    });

    return pitFilingService.getCalculation(userId, periodYear);
  },

  async saveCitDraft(userId: string, body: CitDraftInputs & { periodYear: number }) {
    const periodYear = Number(body.periodYear);
    await this.ensureDraftWorkspace(userId, "CIT", periodYear, CIT_PERIOD_MONTH);
    await prisma.taxPayable.update({
      where: {
        userId_taxType_periodYear_periodMonth: {
          userId,
          taxType: "CIT",
          periodYear,
          periodMonth: CIT_PERIOD_MONTH,
        },
      },
      data: { draftInputs: { adjustments: body.adjustments ?? {} } as Prisma.InputJsonValue },
    });
    return citFilingService.getCalculation(userId, periodYear);
  },

  async ensureDraftWorkspace(
    userId: string,
    taxType: WorkspaceTaxType,
    periodYear: number,
    periodMonth: number,
  ) {
    const existing = await findWorkspace(userId, taxType, periodYear, periodMonth);
    if (existing) return existing;
    const live = await resolveLiveAmountAndComputation(
      userId,
      taxType,
      periodYear,
      periodMonth,
    );
    return prisma.taxPayable.create({
      data: {
        userId,
        taxType,
        periodYear,
        periodMonth,
        amountDue: new Decimal(live.amount),
        totalPayable: new Decimal(live.amount),
        penalties: new Decimal(0),
        filingDueDate: new Date(resolveDueDate(taxType, periodYear, periodMonth)),
        status: "pending",
        currentStep: 1,
        completedSteps: [],
        computation: live.computation as Prisma.InputJsonValue,
      },
    });
  },

  async completeFiling(
    userId: string,
    filingId: string,
    body: {
      rrr?: string;
      paymentReceiptUrl?: string;
      submissionProofUrl?: string;
    },
  ) {
    const row = await loadWorkspaceRow(filingId, userId);
    if (!row.submittedAt) {
      throw new HttpReplyError(
        400,
        "Submit the return before marking compliant.",
        null,
        "VALIDATION_ERROR",
      );
    }

    const amount = d(row.totalPayable);
    const updateData: Record<string, unknown> = {};
    if (body.rrr != null) updateData.rrr = String(body.rrr);
    if (body.paymentReceiptUrl != null) {
      updateData.paymentReceiptUrl = String(body.paymentReceiptUrl);
    }
    if (body.submissionProofUrl != null) {
      updateData.submissionProofUrl = String(body.submissionProofUrl);
    }

    const rrr = String(body.rrr ?? row.rrr ?? "").trim();
    const receipt = String(
      body.paymentReceiptUrl ?? row.paymentReceiptUrl ?? "",
    ).trim();

    if (amount > 0 && (!rrr || !receipt)) {
      throw new HttpReplyError(
        400,
        "Upload payment evidence before marking this period compliant.",
        null,
        "VALIDATION_ERROR",
      );
    }

    updateData.status = "paid";
    updateData.paymentStatus = "paid";
    updateData.currentStep = 12;
    updateData.completedSteps = Array.from({ length: 12 }, (_, i) => i + 1);

    const updated = await prisma.taxPayable.update({
      where: { id: filingId },
      data: updateData,
      include: { documents: { orderBy: { documentId: "asc" } } },
    });

    await appendTimeline(
      filingId,
      WORKSPACE_TIMELINE_EVENTS.COMPLIANT,
      amount <= 0 ? "Nil return marked compliant." : "Payment evidence recorded.",
    );

    return mapWorkspaceRow(updated);
  },

  mapWorkspaceForDetail(row: Awaited<ReturnType<typeof findWorkspace>>) {
    if (!row) return null;
    return mapWorkspaceRow(row);
  },
};
