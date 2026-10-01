import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { CIT_PERIOD_MONTH } from "../../constants/citFiling";
import { PIT_PERIOD_MONTH } from "../../constants/pitFiling";

const ANNUAL_TAX_TYPES = ["PIT", "CIT"] as const;

function annualMonth(taxType: string): number {
  return taxType === "CIT" ? CIT_PERIOD_MONTH : PIT_PERIOD_MONTH;
}

function jsonHasContent(value: Prisma.JsonValue | null | undefined): boolean {
  if (value == null) return false;
  if (typeof value === "object") {
    if (Array.isArray(value)) return value.length > 0;
    return Object.keys(value as object).length > 0;
  }
  return true;
}

function hasFilingProgress(row: {
  submittedAt: Date | null;
  frozen: boolean;
  currentStep: number;
  completedSteps: Prisma.JsonValue;
  draftInputs: Prisma.JsonValue | null;
  computation: Prisma.JsonValue | null;
  formsGenerated: boolean;
  packageUrl: string | null;
  documentUrl: string | null;
  receiptUrl: string | null;
  _count?: { payments: number; documents: number; timeline: number };
}): boolean {
  return (
    row.submittedAt != null ||
    row.frozen ||
    row.currentStep > 1 ||
    jsonHasContent(row.completedSteps) ||
    jsonHasContent(row.draftInputs) ||
    jsonHasContent(row.computation) ||
    row.formsGenerated ||
    Boolean(row.packageUrl) ||
    Boolean(row.documentUrl) ||
    Boolean(row.receiptUrl) ||
    (row._count?.payments ?? 0) > 0 ||
    (row._count?.documents ?? 0) > 0 ||
    (row._count?.timeline ?? 0) > 0
  );
}

function progressScore(row: Parameters<typeof hasFilingProgress>[0]): number {
  let score = 0;
  if (row.submittedAt) score += 1000;
  if (row.frozen) score += 200;
  score += row.currentStep * 10;
  if (jsonHasContent(row.completedSteps)) score += 20;
  if (jsonHasContent(row.draftInputs)) score += 30;
  if (jsonHasContent(row.computation)) score += 30;
  if (row.formsGenerated) score += 40;
  if (row.packageUrl) score += 40;
  if (row.documentUrl) score += 20;
  if (row.receiptUrl) score += 20;
  score += (row._count?.payments ?? 0) * 15;
  score += (row._count?.documents ?? 0) * 5;
  score += (row._count?.timeline ?? 0) * 2;
  return score;
}

/** One PIT row and one CIT row per periodYear. periodMonth stays 12. */
export async function collapseAnnualTaxPayables(userId: string): Promise<void> {
  const rows = await prisma.taxPayable.findMany({
    where: { userId, taxType: { in: [...ANNUAL_TAX_TYPES] } },
    include: {
      _count: { select: { payments: true, documents: true, timeline: true } },
    },
  });

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.taxType}:${row.periodYear}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) {
      const only = group[0];
      if (only && only.periodMonth !== annualMonth(only.taxType)) {
        await prisma.taxPayable.update({
          where: { id: only.id },
          data: { periodMonth: annualMonth(only.taxType) },
        });
      }
      continue;
    }

    const month = annualMonth(group[0]!.taxType);
    const withWork = group.filter(hasFilingProgress);
    const workRow =
      withWork.sort((a, b) => progressScore(b) - progressScore(a))[0] ??
      group.find((r) => r.periodMonth === month) ??
      group[0]!;
    let keeper = group.find((r) => r.periodMonth === month) ?? null;

    if (!keeper) {
      keeper = workRow;
      await prisma.taxPayable.update({
        where: { id: keeper.id },
        data: { periodMonth: month },
      });
    } else if (workRow.id !== keeper.id && progressScore(workRow) > progressScore(keeper)) {
      await prisma.taxPayable.update({
        where: { id: keeper.id },
        data: {
          currentStep: workRow.currentStep,
          completedSteps: workRow.completedSteps ?? undefined,
          frozen: workRow.frozen,
          frozenAt: workRow.frozenAt,
          draftInputs: workRow.draftInputs ?? undefined,
          computation: workRow.computation ?? undefined,
          validation: workRow.validation ?? undefined,
          submittedAt: workRow.submittedAt,
          documentUrl: workRow.documentUrl,
          receiptUrl: workRow.receiptUrl,
          paymentLink: workRow.paymentLink,
          formsGenerated: workRow.formsGenerated,
          packageUrl: workRow.packageUrl,
          packageExpiresAt: workRow.packageExpiresAt,
          submissionReference: workRow.submissionReference,
          rrr: workRow.rrr,
          submissionProofName: workRow.submissionProofName,
          submissionProofUrl: workRow.submissionProofUrl,
          paymentReceiptName: workRow.paymentReceiptName,
          paymentReceiptUrl: workRow.paymentReceiptUrl,
          acknowledgedGaps: workRow.acknowledgedGaps,
          reviewedDocumentIds: workRow.reviewedDocumentIds ?? undefined,
          status: workRow.status,
          paymentStatus: workRow.paymentStatus,
          amountDue: workRow.amountDue,
          totalPayable: workRow.totalPayable,
          penalties: workRow.penalties,
          filingDueDate: workRow.filingDueDate,
          tin: workRow.tin,
          stateOfResidence: workRow.stateOfResidence,
          rcNumber: workRow.rcNumber,
          companyName: workRow.companyName,
        },
      });
    }

    const extras = group.filter((r) => r.id !== keeper.id);
    for (const extra of extras) {
      await prisma.paymentRecord.updateMany({
        where: { taxPayableId: extra.id },
        data: { taxPayableId: keeper.id },
      });
      await prisma.filingTimelineEvent.updateMany({
        where: { taxPayableId: extra.id },
        data: { taxPayableId: keeper.id },
      });
      const extraDocs = await prisma.filingDocument.findMany({
        where: { taxPayableId: extra.id },
      });
      for (const doc of extraDocs) {
        const clash = await prisma.filingDocument.findFirst({
          where: { taxPayableId: keeper.id, documentId: doc.documentId },
        });
        if (clash) {
          await prisma.filingDocument.delete({ where: { id: doc.id } });
        } else {
          await prisma.filingDocument.update({
            where: { id: doc.id },
            data: { taxPayableId: keeper.id },
          });
        }
      }
      await prisma.taxPayable.delete({ where: { id: extra.id } });
    }
  }
}
