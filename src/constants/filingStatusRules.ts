import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { HttpReplyError } from "../utils/httpReplyError";

export const FILING_HUB_TAX_TYPES = ["VAT", "WHT", "CIT", "PIT"] as const;

export const COMPLIANT_STEP = 12;
export const SUBMIT_REFERENCE_STEP = 8;
export const AFTER_SUBMIT_STEP = 9;

export type FilingHubStatus = "pending" | "submitted" | "overdue" | "paid";
export type OverviewFilingStatus = "Pending" | "Overdue" | "Filed";

export function parseCompletedSteps(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= COMPLIANT_STEP),
    ),
  ].sort((a, b) => a - b);
}

export function withCompletedStep(value: unknown, step: number): number[] {
  return parseCompletedSteps([...parseCompletedSteps(value), step]);
}

export function completedStepsInclude(
  value: unknown,
  step: number,
): boolean {
  return parseCompletedSteps(value).includes(step);
}

/** Compliant only after Mark as Compliant (step 12). */
export function isFilingCompliant(row: {
  status?: string | null;
  completedSteps?: unknown;
}): boolean {
  return (
    completedStepsInclude(row.completedSteps, COMPLIANT_STEP) &&
    (row.status === "paid" || row.status === "overpaid")
  );
}

export function requireSubmissionReference(value: unknown): string {
  const ref = value != null ? String(value).trim() : "";
  if (!ref) {
    throw new HttpReplyError(
      400,
      "submissionReference is required.",
      null,
      "VALIDATION_ERROR",
    );
  }
  return ref;
}

export function yearNotOpenMessage(periodYear: number): string {
  return `The ${periodYear} return can be filed from 1 January ${periodYear + 1}.`;
}

export function deriveHubFilingStatus(row: {
  status: string;
  submittedAt?: Date | string | null;
  completedSteps?: unknown;
  filingDueDate: Date;
  today?: Date;
}): FilingHubStatus {
  if (
    isFilingCompliant(row) ||
    row.status === "paid" ||
    row.status === "overpaid"
  ) {
    return "paid";
  }
  if (row.submittedAt) return "submitted";
  const today = row.today ? new Date(row.today) : new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(row.filingDueDate);
  due.setHours(0, 0, 0, 0);
  if (due < today) return "overdue";
  return "pending";
}

export function overviewFilingStatusFromRow(
  row: {
    status: string;
    completedSteps?: unknown;
  } | null,
  dueYmd: string,
  todayYmd: string,
): OverviewFilingStatus {
  if (row && isFilingCompliant(row)) return "Filed";
  if (dueYmd < todayYmd) return "Overdue";
  return "Pending";
}

/**
 * Paid without step 12 was closed too early. Keep submitted rows as submitted.
 * Keep the workspace step the user had reached.
 */
export async function reopenPrematurelyClosedFilings(
  userId: string,
): Promise<void> {
  const rows = await prisma.taxPayable.findMany({
    where: {
      userId,
      taxType: { in: [...FILING_HUB_TAX_TYPES] },
      status: { in: ["paid", "overpaid"] },
    },
    select: { id: true, status: true, completedSteps: true },
  });
  const ids = rows
    .filter((row) => !completedStepsInclude(row.completedSteps, COMPLIANT_STEP))
    .map((row) => row.id);
  if (ids.length === 0) return;
  await prisma.taxPayable.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "submitted",
      paymentStatus: "unpaid",
    },
  });
}

export function step8WorkspacePatch(existing?: {
  currentStep?: number;
  completedSteps?: Prisma.JsonValue | null;
}): {
  status: "submitted";
  paymentStatus: "unpaid";
  currentStep: number;
  completedSteps: number[];
} {
  const current = existing?.currentStep ?? 1;
  return {
    status: "submitted",
    paymentStatus: "unpaid",
    currentStep: Math.max(current, AFTER_SUBMIT_STEP),
    completedSteps: withCompletedStep(
      existing?.completedSteps,
      SUBMIT_REFERENCE_STEP,
    ),
  };
}
