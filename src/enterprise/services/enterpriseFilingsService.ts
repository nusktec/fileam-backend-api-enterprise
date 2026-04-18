import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { genericTaxFilingService } from "../../services/genericTaxFilingService";
import { filingTaxTypeService } from "./filingTaxTypeService";
import { filingsService } from "../../mobile/services/filingsService";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function periodLabel(year: number, month: number): string {
  return `${new Date(year, month - 1).toLocaleString("default", { month: "long" })} ${year}`;
}

function daysUntil(d: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(d);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export async function getFilingsSummary(linkedUserId: string) {
  const payables = await prisma.taxPayable.findMany({
    where: { userId: linkedUserId },
    include: { payments: { where: { status: "completed" } } },
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let submitted = 0;
  let inProgress = 0;
  let todayCount = 0;
  let overdue = 0;
  let submittedDays = 0;
  let inProgressDays = 0;
  let todayDays = 0;
  let overdueDays = 0;

  for (const p of payables) {
    const totalPayable = decimalToNumber(p.totalPayable);
    const totalPaid = p.payments.reduce(
      (s, r) => s + decimalToNumber(r.amountPaid),
      0,
    );
    const due = new Date(p.filingDueDate);
    due.setHours(0, 0, 0, 0);
    const days = daysUntil(p.filingDueDate);

    if (p.status === "paid" || totalPaid >= totalPayable) {
      submitted++;
      if (submittedDays === 0 || days < submittedDays) submittedDays = Math.abs(days);
    } else if (p.submittedAt) {
      submitted++;
      if (submittedDays === 0 || days < submittedDays) submittedDays = Math.abs(days);
    } else if (due < today) {
      overdue++;
      overdueDays = Math.max(overdueDays, Math.abs(days));
    } else if (days === 0) {
      todayCount++;
      todayDays = 0;
    } else {
      inProgress++;
      if (inProgressDays === 0 || days < inProgressDays) inProgressDays = days;
    }
  }

  return {
    submitted: { count: submitted, days: submittedDays },
    inProgress: { count: inProgress, days: inProgressDays },
    today: { count: todayCount, days: todayDays },
    overdue: { count: overdue, days: overdueDays },
  };
}

function readinessForPayable(p: {
  status: string;
  submittedAt: Date | null;
  totalPayable: Decimal;
  payments: { amountPaid: Decimal }[];
}): number {
  const totalPayable = decimalToNumber(p.totalPayable);
  const totalPaid = p.payments.reduce(
    (s, r) => s + decimalToNumber(r.amountPaid),
    0,
  );
  if (p.status === "paid" || totalPaid >= totalPayable) return 100;
  if (p.submittedAt) return 90;
  if (totalPayable > 0)
    return Math.min(80, Math.round((totalPaid / totalPayable) * 80));
  return 0;
}

/** Optional taxType filters to that active tax code; omit for all tax types. */
export async function getTaxReturns(
  linkedUserId: string,
  taxTypeFilter?: string | null,
) {
  const where: { userId: string; taxType?: string } = {
    userId: linkedUserId,
  };
  const t = taxTypeFilter?.trim();
  if (t) where.taxType = t.toUpperCase();

  const payables = await prisma.taxPayable.findMany({
    where,
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    include: { payments: { where: { status: "completed" } } },
  });
  return payables.map((p) => ({
    id: p.id,
    taxType: p.taxType,
    periodLabel: periodLabel(p.periodYear, p.periodMonth),
    periodYear: p.periodYear,
    periodMonth: p.periodMonth,
    dueDate: p.filingDueDate,
    readiness: readinessForPayable(p),
  }));
}

export async function getVatReturns(linkedUserId: string) {
  return getTaxReturns(linkedUserId, "VAT");
}

export async function getUnfiledItems(linkedUserId: string) {
  const payables = await prisma.taxPayable.findMany({
    where: {
      userId: linkedUserId,
      status: { in: ["pending", "draft"] },
    },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    include: {
      payments: { where: { status: "completed" } },
    },
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return payables.map((p) => {
    const totalPayable = decimalToNumber(p.totalPayable);
    const totalPaid = p.payments.reduce(
      (s, r) => s + decimalToNumber(r.amountPaid),
      0,
    );
    const due = new Date(p.filingDueDate);
    due.setHours(0, 0, 0, 0);
    return {
      id: p.id,
      taxType: p.taxType,
      periodYear: p.periodYear,
      periodMonth: p.periodMonth,
      periodLabel: periodLabel(p.periodYear, p.periodMonth),
      amount: totalPayable,
      totalPaid,
      dueDate: p.filingDueDate,
      isOverdue: due < today,
    };
  });
}

export async function listFilings(
  linkedUserId: string,
  opts?: {
    page?: number;
    limit?: number;
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
  },
) {
  const page = opts?.page ?? 1;
  const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
  return filingsService.list(
    linkedUserId,
    {
      dbStatus: opts?.status,
      taxType: undefined,
    },
    {
      page,
      limit,
      sortOrder: "DESC",
      dateFrom: opts?.dateFrom,
      dateTo: opts?.dateTo,
    },
  );
}

export async function createFiling(
  linkedUserId: string,
  data: {
    taxType: string;
    periodYear: number;
    periodMonth: number;
    amount: number;
    paymentStatus?: "paid" | "not_paid";
    dueDate?: Date;
    receiptUrl?: string;
    documentUrl?: string;
    evidenceVaultId?: string;
    stateOfOperation?: string;
    vatRegistrationNumber?: string;
  },
) {
  const taxType = data.taxType.trim().toUpperCase();
  const allowed = await filingTaxTypeService.isActiveCode(taxType);
  if (!allowed) return null;

  const dueDate =
    data.dueDate ??
    new Date(data.periodYear, data.periodMonth, 21);
  const paid = data.paymentStatus === "paid";

  if (taxType === "VAT") {
    const { vatFilingService } = await import("../../mobile/services/vatFilingService");
    return vatFilingService.submit(linkedUserId, {
      periodYear: data.periodYear,
      periodMonth: data.periodMonth,
      amount: data.amount,
      dueDate,
      paymentStatus: paid ? "paid" : "not_paid",
      receiptUrl: data.receiptUrl,
      documentUrl: data.documentUrl,
      evidenceVaultId: data.evidenceVaultId,
      stateOfOperation: data.stateOfOperation,
      vatRegistrationNumber: data.vatRegistrationNumber,
    });
  }

  if (taxType === "WHT") {
    const { whtFilingService } = await import("../../mobile/services/whtFilingService");
    return whtFilingService.submit(linkedUserId, {
      periodYear: data.periodYear,
      periodMonth: data.periodMonth,
      totalWht: data.amount,
      dueDate,
      paymentStatus: paid ? "paid" : "not_paid",
      receiptUrl: data.receiptUrl,
      documentUrl: data.documentUrl,
      evidenceVaultId: data.evidenceVaultId,
    });
  }

  return genericTaxFilingService.submit(linkedUserId, taxType, {
    periodYear: data.periodYear,
    periodMonth: data.periodMonth,
    amount: data.amount,
    dueDate,
    paymentStatus: paid ? "paid" : "not_paid",
    receiptUrl: data.receiptUrl,
    documentUrl: data.documentUrl,
    evidenceVaultId: data.evidenceVaultId,
    stateOfOperation: data.stateOfOperation,
    vatRegistrationNumber: data.vatRegistrationNumber,
  });
}

export async function submitClientVatReturn(
  linkedUserId: string,
  data: Omit<
    Parameters<typeof createFiling>[1],
    "taxType"
  >,
) {
  return createFiling(linkedUserId, { ...data, taxType: "VAT" });
}

export async function getFilingReport(
  linkedUserId: string,
  filingId: string,
) {
  const payable = await prisma.taxPayable.findFirst({
    where: { id: filingId, userId: linkedUserId },
  });
  if (!payable) return null;

  // Stored reports often use labels (e.g. "VAT Return Summary"), not raw taxType ("VAT").
  const report = await prisma.report.findFirst({
    where: {
      userId: linkedUserId,
      periodYear: payable.periodYear,
      periodMonth: payable.periodMonth,
      OR: [
        { reportType: payable.taxType },
        {
          reportType: {
            contains: payable.taxType,
            mode: "insensitive",
          },
        },
      ],
    },
    orderBy: { generatedAt: "desc" },
  });

  const fallbackReport =
    report ??
    (await prisma.report.findFirst({
      where: {
        userId: linkedUserId,
        periodYear: payable.periodYear,
        periodMonth: payable.periodMonth,
      },
      orderBy: { generatedAt: "desc" },
    }));

  if (fallbackReport) {
    return {
      id: fallbackReport.id,
      filingId: payable.id,
      reportType: fallbackReport.reportType,
      periodLabel: fallbackReport.periodLabel,
      periodYear: fallbackReport.periodYear,
      periodMonth: fallbackReport.periodMonth,
      generatedAt: fallbackReport.generatedAt,
      documentUrl:
        fallbackReport.documentUrl ?? payable.documentUrl ?? undefined,
      format: fallbackReport.format,
      taxType: payable.taxType,
    };
  }

  return {
    id: null,
    filingId: payable.id,
    reportType: payable.taxType,
    periodLabel: periodLabel(payable.periodYear, payable.periodMonth),
    periodYear: payable.periodYear,
    periodMonth: payable.periodMonth,
    generatedAt: null,
    documentUrl: payable.documentUrl ?? undefined,
    format: undefined,
    taxType: payable.taxType,
    hasGeneratedReport: false,
  };
}
