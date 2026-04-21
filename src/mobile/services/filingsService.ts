import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function periodLabel(year: number, month: number): string {
  return `${new Date(year, month - 1).toLocaleString("default", { month: "long" })} ${year}`;
}

export type FilingDisplayStatus = "overdue" | "submitted" | "paid" | "pending";

export type FilingCompletionItemKey =
  | "tax_amount_set"
  | "filing_document_or_payment_proof"
  | "filing_evidence_vault"
  | "period_sales_invoiced"
  | "period_expenses_receipted"
  | "vat_state_of_operation"
  | "vat_registration_number"
  | "wht_schedule_lines"
  | "submitted_to_authority";

export type FilingCompletionItem = {
  key: FilingCompletionItemKey;
  label: string;
  met: boolean;
  category: "filing_record" | "period_records" | "tax_specific" | "workflow";
};

export type PeriodRecordCompliance = {
  saleCount: number;
  expenseCount: number;
  salesWithInvoiceOrVault: number;
  expensesWithReceipt: number;
  salesMissingEvidence: number;
  expensesMissingReceipt: number;
};

async function getPeriodRecordCompliance(
  userId: string,
  year: number,
  month: number,
): Promise<PeriodRecordCompliance> {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const saleDate = { gte: start, lte: end };
  const expenseDate = { gte: start, lte: end };
  const [saleCount, expenseCount, salesMissingEvidence, expensesMissingReceipt] =
    await Promise.all([
      prisma.sale.count({ where: { userId, saleDate } }),
      prisma.expense.count({ where: { userId, expenseDate } }),
      prisma.sale.count({
        where: {
          userId,
          saleDate,
          documentUrl: null,
          evidenceVaultId: null,
        },
      }),
      prisma.expense.count({
        where: { userId, expenseDate, receiptUrl: null },
      }),
    ]);
  return {
    saleCount,
    expenseCount,
    salesWithInvoiceOrVault: saleCount - salesMissingEvidence,
    expensesWithReceipt: expenseCount - expensesMissingReceipt,
    salesMissingEvidence,
    expensesMissingReceipt,
  };
}

async function getWhtScheduleLineCountForPeriod(
  userId: string,
  year: number,
  month: number,
): Promise<number> {
  const draft = await prisma.filingDraft.findUnique({
    where: {
      userId_taxType_periodYear_periodMonth: {
        userId,
        taxType: "WHT",
        periodYear: year,
        periodMonth: month,
      },
    },
    select: { _count: { select: { whtScheduleLines: true } } },
  });
  return draft?._count.whtScheduleLines ?? 0;
}

function buildFilingCompletion(
  p: {
    taxType: string;
    totalPayable: Decimal | null;
    documentUrl: string | null;
    evidenceVaultId: string | null;
    receiptUrl: string | null;
    stateOfOperation: string | null;
    vatRegistrationNumber: string | null;
    submittedAt: Date | null;
  },
  period: PeriodRecordCompliance,
  whtLineCount: number | null,
): {
  completionPercent: number;
  completion: {
    met: number;
    total: number;
    items: FilingCompletionItem[];
  };
} {
  const tt = (p.taxType || "").trim().toUpperCase();
  const items: FilingCompletionItem[] = [];

  const salesComplete =
    period.saleCount === 0 || period.salesMissingEvidence === 0;
  const expensesComplete =
    period.expenseCount === 0 || period.expensesMissingReceipt === 0;

  items.push({
    key: "tax_amount_set",
    label: "Amount due set on this filing",
    met: decimalToNumber(p.totalPayable) > 0,
    category: "filing_record",
  });
  items.push({
    key: "filing_document_or_payment_proof",
    label: "Filing document, acknowledgement, or payment proof added",
    met: Boolean(
      (p.documentUrl && p.documentUrl.trim() !== "") ||
        (p.receiptUrl && p.receiptUrl.trim() !== ""),
    ),
    category: "filing_record",
  });
  items.push({
    key: "filing_evidence_vault",
    label: "Evidence vault document linked",
    met: Boolean(p.evidenceVaultId && p.evidenceVaultId.trim() !== ""),
    category: "filing_record",
  });
  items.push({
    key: "period_sales_invoiced",
    label:
      period.saleCount === 0
        ? "No sales this period (invoices not required)"
        : "All invoices uploaded or linked from vault",
    met: salesComplete,
    category: "period_records",
  });
  items.push({
    key: "period_expenses_receipted",
    label:
      period.expenseCount === 0
        ? "No expenses this period (receipts not required)"
        : "All expense receipts uploaded",
    met: expensesComplete,
    category: "period_records",
  });

  if (tt === "VAT") {
    items.push({
      key: "vat_state_of_operation",
      label: "State of operation added (VAT)",
      met: Boolean(p.stateOfOperation && p.stateOfOperation.trim() !== ""),
      category: "tax_specific",
    });
    items.push({
      key: "vat_registration_number",
      label: "VAT / TIN on filing",
      met: Boolean(
        p.vatRegistrationNumber && p.vatRegistrationNumber.trim() !== "",
      ),
      category: "tax_specific",
    });
  } else if (tt === "WHT" && whtLineCount !== null) {
    items.push({
      key: "wht_schedule_lines",
      label: "WHT schedule has line items",
      met: whtLineCount > 0,
      category: "tax_specific",
    });
  }

  items.push({
    key: "submitted_to_authority",
    label: "Return submitted",
    met: p.submittedAt != null,
    category: "workflow",
  });

  const metCount = items.filter((i) => i.met).length;
  const completionPercent =
    items.length === 0 ? 0 : Math.round((metCount / items.length) * 100);

  return {
    completionPercent,
    completion: {
      met: metCount,
      total: items.length,
      items,
    },
  };
}

function deriveDisplayStatus(payable: {
  status: string;
  submittedAt: Date | null;
  filingDueDate: Date;
  totalPayable: number;
  totalPaid: number;
}): FilingDisplayStatus {
  if (payable.status === "paid" || payable.status === "overpaid") return "paid";
  if (payable.totalPaid >= payable.totalPayable && payable.totalPayable > 0)
    return "paid";
  if (payable.submittedAt) return "submitted";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(payable.filingDueDate);
  due.setHours(0, 0, 0, 0);
  if (due < today) return "overdue";
  return "pending";
}

export const filingsService = {
  async list(
    userId: string,
    filters?: {
      taxType?: string;
      /** Post-filter: UI status (pending | submitted | paid | overdue). */
      displayStatus?: string;
      /** Prisma `tax_payables.status` filter (e.g. pending, paid). Enterprise list. */
      dbStatus?: string;
    },
    opts?: {
      page?: number;
      limit?: number;
      sortOrder?: "ASC" | "DESC";
      dateFrom?: Date;
      dateTo?: Date;
    },
  ) {
    const where: {
      userId: string;
      taxType?: string;
      status?: string;
      filingDueDate?: { gte?: Date; lte?: Date };
    } = { userId };
    if (filters?.taxType) where.taxType = filters.taxType;
    if (filters?.dbStatus && filters.dbStatus !== "all") {
      where.status = filters.dbStatus;
    }
    if (opts?.dateFrom || opts?.dateTo) {
      where.filingDueDate = {};
      if (opts.dateFrom) where.filingDueDate.gte = opts.dateFrom;
      if (opts.dateTo) where.filingDueDate.lte = opts.dateTo;
    }
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 10), 100);
    const order = opts?.sortOrder === "ASC" ? "asc" : "desc";

    const [payables, total] = await Promise.all([
      prisma.taxPayable.findMany({
        where,
        orderBy: [{ periodYear: order }, { periodMonth: order }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          payments: {
            where: { status: "completed" },
            orderBy: { paidAt: "desc" },
          },
        },
      }),
      prisma.taxPayable.count({ where }),
    ]);

    const periodKeySet = new Map<string, { year: number; month: number }>();
    for (const p of payables) {
      const k = `${p.periodYear}-${p.periodMonth}`;
      if (!periodKeySet.has(k)) {
        periodKeySet.set(k, { year: p.periodYear, month: p.periodMonth });
      }
    }
    const uniquePeriods = [...periodKeySet.values()];
    const complianceByPeriodKey = new Map<string, PeriodRecordCompliance>();
    await Promise.all(
      uniquePeriods.map(async ({ year, month }) => {
        const c = await getPeriodRecordCompliance(userId, year, month);
        complianceByPeriodKey.set(`${year}-${month}`, c);
      }),
    );

    const vatRows = payables.filter(
      (p) => p.taxType.trim().toUpperCase() === "VAT",
    );
    const vatDraftByPeriodKey = new Map<
      string,
      { stateOfOperation: string | null; vatRegistrationNumber: string | null }
    >();
    if (vatRows.length > 0) {
      const vatDrafts = await prisma.filingDraft.findMany({
        where: {
          userId,
          taxType: "VAT",
          OR: vatRows.map((p) => ({
            periodYear: p.periodYear,
            periodMonth: p.periodMonth,
          })),
        },
        select: {
          periodYear: true,
          periodMonth: true,
          stateOfOperation: true,
          vatRegistrationNumber: true,
        },
      });
      for (const d of vatDrafts) {
        vatDraftByPeriodKey.set(`${d.periodYear}-${d.periodMonth}`, {
          stateOfOperation: d.stateOfOperation,
          vatRegistrationNumber: d.vatRegistrationNumber,
        });
      }
    }

    const whtRows = payables.filter(
      (p) => p.taxType.trim().toUpperCase() === "WHT",
    );
    const whtLinesByPeriodKey = new Map<string, number>();
    if (whtRows.length > 0) {
      const whtDrafts = await prisma.filingDraft.findMany({
        where: {
          userId,
          taxType: "WHT",
          OR: whtRows.map((p) => ({
            periodYear: p.periodYear,
            periodMonth: p.periodMonth,
          })),
        },
        select: {
          periodYear: true,
          periodMonth: true,
          _count: { select: { whtScheduleLines: true } },
        },
      });
      for (const d of whtDrafts) {
        whtLinesByPeriodKey.set(
          `${d.periodYear}-${d.periodMonth}`,
          d._count.whtScheduleLines,
        );
      }
    }

    let items = payables.map((p) => {
      const pk = `${p.periodYear}-${p.periodMonth}`;
      const periodRecordCompliance = complianceByPeriodKey.get(pk)!;
      const vatDraft = vatDraftByPeriodKey.get(pk);
      const stateOfOperation =
        p.stateOfOperation ?? vatDraft?.stateOfOperation ?? null;
      const vatRegistrationNumber =
        p.vatRegistrationNumber ?? vatDraft?.vatRegistrationNumber ?? null;
      const whtLineCount =
        p.taxType.trim().toUpperCase() === "WHT"
          ? (whtLinesByPeriodKey.get(pk) ?? 0)
          : null;

      const totalPayable = decimalToNumber(p.totalPayable);
      const totalPaid = p.payments.reduce(
        (s, r) => s + decimalToNumber(r.amountPaid),
        0,
      );
      const displayStatus = deriveDisplayStatus({
        status: p.status,
        submittedAt: p.submittedAt,
        filingDueDate: p.filingDueDate,
        totalPayable,
        totalPaid,
      });
      const { completionPercent, completion } = buildFilingCompletion(
        {
          taxType: p.taxType,
          totalPayable: p.totalPayable,
          documentUrl: p.documentUrl,
          evidenceVaultId: p.evidenceVaultId,
          receiptUrl: p.receiptUrl,
          stateOfOperation,
          vatRegistrationNumber,
          submittedAt: p.submittedAt,
        },
        periodRecordCompliance,
        whtLineCount,
      );
      return {
        id: p.id,
        taxType: p.taxType,
        periodYear: p.periodYear,
        periodMonth: p.periodMonth,
        periodLabel: periodLabel(p.periodYear, p.periodMonth),
        amount: totalPayable,
        status: displayStatus,
        dueDate: p.filingDueDate,
        submittedDate: p.submittedAt ?? undefined,
        submittedAt: p.submittedAt ?? undefined,
        completionPercent,
        completion,
        periodRecordCompliance,
        periodAttachmentGaps: {
          salesMissingEvidence: periodRecordCompliance.salesMissingEvidence,
          expensesMissingReceipt: periodRecordCompliance.expensesMissingReceipt,
        },
      };
    });

    const displayStatusFilter = (filters?.displayStatus || "").toLowerCase();
    if (displayStatusFilter && displayStatusFilter !== "all") {
      items = items.filter((i) => i.status === displayStatusFilter);
    }
    return {
      data: items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async getById(userId: string, filingId: string) {
    const p = await prisma.taxPayable.findFirst({
      where: { id: filingId, userId },
      include: {
        payments: {
          where: { status: "completed" },
          orderBy: { paidAt: "desc" },
        },
        timeline: { orderBy: { eventDate: "asc" } },
      },
    });
    if (!p) return null;

    const totalPayable = decimalToNumber(p.totalPayable);
    const totalPaid = p.payments.reduce(
      (s, r) => s + decimalToNumber(r.amountPaid),
      0,
    );
    const displayStatus = deriveDisplayStatus({
      status: p.status,
      submittedAt: p.submittedAt,
      filingDueDate: p.filingDueDate,
      totalPayable,
      totalPaid,
    });
    const periodRecordCompliance = await getPeriodRecordCompliance(
      userId,
      p.periodYear,
      p.periodMonth,
    );
    let stateOfOperation: string | null = p.stateOfOperation;
    let vatRegistrationNumber: string | null = p.vatRegistrationNumber;
    if (p.taxType.trim().toUpperCase() === "VAT") {
      const vatDraft = await prisma.filingDraft.findUnique({
        where: {
          userId_taxType_periodYear_periodMonth: {
            userId,
            taxType: "VAT",
            periodYear: p.periodYear,
            periodMonth: p.periodMonth,
          },
        },
        select: { stateOfOperation: true, vatRegistrationNumber: true },
      });
      stateOfOperation =
        stateOfOperation ?? vatDraft?.stateOfOperation ?? null;
      vatRegistrationNumber =
        vatRegistrationNumber ?? vatDraft?.vatRegistrationNumber ?? null;
    }
    const whtLineCount =
      p.taxType.trim().toUpperCase() === "WHT"
        ? await getWhtScheduleLineCountForPeriod(
            userId,
            p.periodYear,
            p.periodMonth,
          )
        : null;
    const { completionPercent, completion } = buildFilingCompletion(
      {
        taxType: p.taxType,
        totalPayable: p.totalPayable,
        documentUrl: p.documentUrl,
        evidenceVaultId: p.evidenceVaultId,
        receiptUrl: p.receiptUrl,
        stateOfOperation,
        vatRegistrationNumber,
        submittedAt: p.submittedAt,
      },
      periodRecordCompliance,
      whtLineCount,
    );

    return {
      id: p.id,
      taxType: p.taxType,
      periodYear: p.periodYear,
      periodMonth: p.periodMonth,
      periodLabel: periodLabel(p.periodYear, p.periodMonth),
      amount: totalPayable,
      status: displayStatus,
      dueDate: p.filingDueDate,
      submittedAt: p.submittedAt ?? undefined,
      documentUrl: p.documentUrl ?? undefined,
      evidenceVaultId: p.evidenceVaultId ?? undefined,
      stateOfOperation: p.stateOfOperation ?? undefined,
      vatRegistrationNumber: p.vatRegistrationNumber ?? undefined,
      receiptUrl: p.receiptUrl ?? undefined,
      completionPercent,
      completion,
      periodRecordCompliance,
      periodAttachmentGaps: {
        salesMissingEvidence: periodRecordCompliance.salesMissingEvidence,
        expensesMissingReceipt: periodRecordCompliance.expensesMissingReceipt,
      },
      totalPaid,
      currency: p.currency,
      timeline: p.timeline.map((e) => ({
        id: e.id,
        event: e.event,
        description: e.description ?? undefined,
        eventDate: e.eventDate ?? undefined,
        createdAt: e.createdAt,
      })),
    };
  },

  async getDocumentUrl(
    userId: string,
    filingId: string,
  ): Promise<string | null> {
    const p = await prisma.taxPayable.findFirst({
      where: { id: filingId, userId },
      select: { documentUrl: true },
    });
    return p?.documentUrl ?? null;
  },

  async getVaultLink(userId: string, filingId: string): Promise<string | null> {
    const p = await prisma.taxPayable.findFirst({
      where: { id: filingId, userId },
      select: { evidenceVaultId: true },
    });
    return p?.evidenceVaultId ?? null;
  },

  async update(
    userId: string,
    filingId: string,
    data: Partial<{
      status: string;
      documentUrl: string;
      submittedAt: string | Date | null;
      receiptUrl: string;
    }>,
  ) {
    const p = await prisma.taxPayable.findFirst({
      where: { id: filingId, userId },
    });
    if (!p) return null;

    const updateData: Record<string, unknown> = {};
    if (data.status != null) updateData.status = data.status;
    if (data.documentUrl != null) updateData.documentUrl = data.documentUrl;
    if (data.receiptUrl != null) updateData.receiptUrl = data.receiptUrl;
    if (data.submittedAt !== undefined) {
      updateData.submittedAt = data.submittedAt
        ? new Date(data.submittedAt)
        : null;
    }

    await prisma.taxPayable.update({
      where: { id: filingId },
      data: updateData,
    });
    return this.getById(userId, filingId);
  },
};
