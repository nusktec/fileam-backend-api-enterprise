import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function periodLabel(year: number, month: number): string {
  return `${new Date(year, month - 1).toLocaleString("default", { month: "long" })} ${year}`;
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
  opts?: { page?: number; limit?: number; status?: string },
) {
  const where: { userId: string; status?: string } = { userId: linkedUserId };
  if (opts?.status && opts.status !== "all") where.status = opts.status;
  const page = opts?.page ?? 1;
  const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
  const [payables, total] = await Promise.all([
    prisma.taxPayable.findMany({
      where,
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: { payments: { where: { status: "completed" } } },
    }),
    prisma.taxPayable.count({ where }),
  ]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const data = payables.map((p) => {
    const totalPayable = decimalToNumber(p.totalPayable);
    const totalPaid = p.payments.reduce(
      (s, r) => s + decimalToNumber(r.amountPaid),
      0,
    );
    const due = new Date(p.filingDueDate);
    due.setHours(0, 0, 0, 0);
    let status: "overdue" | "submitted" | "paid" | "pending" = "pending";
    if (p.status === "paid" || totalPaid >= totalPayable) status = "paid";
    else if (p.submittedAt) status = "submitted";
    else if (due < today) status = "overdue";
    return {
      id: p.id,
      taxType: p.taxType,
      periodYear: p.periodYear,
      periodMonth: p.periodMonth,
      periodLabel: periodLabel(p.periodYear, p.periodMonth),
      amount: totalPayable,
      status,
      dueDate: p.filingDueDate,
      submittedAt: p.submittedAt ?? undefined,
    };
  });
  return { data, total, page, limit };
}

export async function createFiling(
  linkedUserId: string,
  data: {
    taxType: "VAT" | "WHT";
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
  const dueDate =
    data.dueDate ??
    new Date(data.periodYear, data.periodMonth, 21);
  const paid = data.paymentStatus === "paid";

  if (data.taxType === "VAT") {
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

  if (data.taxType === "WHT") {
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

  return null;
}

export async function getFilingReport(
  linkedUserId: string,
  filingId: string,
) {
  const payable = await prisma.taxPayable.findFirst({
    where: { id: filingId, userId: linkedUserId },
  });
  if (!payable) return null;
  const report = await prisma.report.findFirst({
    where: {
      userId: linkedUserId,
      periodYear: payable.periodYear,
      periodMonth: payable.periodMonth,
      reportType: payable.taxType,
    },
    orderBy: { generatedAt: "desc" },
  });
  if (!report) return null;
  return {
    id: report.id,
    filingId: payable.id,
    reportType: report.reportType,
    periodLabel: report.periodLabel,
    periodYear: report.periodYear,
    periodMonth: report.periodMonth,
    generatedAt: report.generatedAt,
    documentUrl: report.documentUrl ?? undefined,
    format: report.format,
  };
}
