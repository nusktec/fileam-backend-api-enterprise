import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { isValidPrepaymentFrequency } from "../../constants/prepayment";
import { SALE_STATUS } from "../../constants/salePaymentRules";
import { nextDisplayCode } from "../../utils/codeGenerator";
import { resolveSupplierDirectory } from "../../utils/directoryResolver";
import { HttpReplyError } from "../../utils/httpReplyError";
import { formatYmd } from "../../utils/transactionSummaryHelper";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";

const PREPAYMENT_COUNTER = "prepayment_code";
const SCHEDULE_COUNTER = "prepayment_schedule_code";
const EXPENSE_COUNTER = "expense_number";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  return Number(v);
}

function parseDateOnly(value: string, field = "date"): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) throw new HttpReplyError(400, `${field} must be YYYY-MM-DD`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function monthLabel(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthsBetween(start: Date, end: Date): number {
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1
  );
}

function servicePeriodLabel(start: Date, end: Date): string {
  const months = monthsBetween(start, end);
  return `${months} Month${months === 1 ? "" : "s"}`;
}

type ScheduleDraft = {
  recognitionDate: Date;
  recognitionPeriod: string;
  amount: number;
};

function buildScheduleDrafts(
  totalAmount: number,
  start: Date,
  end: Date,
  frequency: string,
  customSchedule?: Array<{ recognitionDate: string; amount: number }>,
): ScheduleDraft[] {
  if (frequency === "CUSTOM") {
    if (!customSchedule?.length) {
      throw new HttpReplyError(
        400,
        "customSchedule is required when recognitionFrequency is CUSTOM",
      );
    }
    return customSchedule.map((row) => ({
      recognitionDate: parseDateOnly(row.recognitionDate, "recognitionDate"),
      recognitionPeriod: monthLabel(parseDateOnly(row.recognitionDate)),
      amount: normalizeMoneyAmount(row.amount),
    }));
  }

  const drafts: ScheduleDraft[] = [];
  if (frequency === "ANNUALLY") {
    const years = Math.max(
      1,
      end.getUTCFullYear() - start.getUTCFullYear() + 1,
    );
    const per = normalizeMoneyAmount(totalAmount / years);
    let cursor = new Date(start);
    for (let i = 0; i < years; i++) {
      drafts.push({
        recognitionDate: new Date(cursor),
        recognitionPeriod: String(cursor.getUTCFullYear()),
        amount: i === years - 1 ? totalAmount - per * (years - 1) : per,
      });
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear() + 1, cursor.getUTCMonth(), 1),
      );
      if (cursor > end && i < years - 1) break;
    }
    return drafts;
  }

  const stepMonths = frequency === "QUARTERLY" ? 3 : 1;
  const dates: Date[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + stepMonths, 1),
    );
  }
  if (dates.length === 0) dates.push(new Date(start));
  const per = normalizeMoneyAmount(totalAmount / dates.length);
  return dates.map((date, idx) => ({
    recognitionDate: date,
    recognitionPeriod: monthLabel(date),
    amount:
      idx === dates.length - 1
        ? normalizeMoneyAmount(totalAmount - per * (dates.length - 1))
        : per,
  }));
}

async function nextExpenseNumberTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
): Promise<string> {
  const counter = await tx.counter.upsert({
    where: { id: EXPENSE_COUNTER },
    create: { id: EXPENSE_COUNTER, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `EXP-${String(counter.lastNumber).padStart(3, "0")}`;
}

async function findPrepayment(userId: string, prepaymentIdOrCode: string) {
  return prisma.prepayment.findFirst({
    where: {
      userId,
      OR: [{ id: prepaymentIdOrCode }, { prepaymentCode: prepaymentIdOrCode }],
    },
    include: { schedule: { orderBy: { recognitionDate: "asc" } } },
  });
}

function mapListItem(row: {
  prepaymentCode: string;
  description: string;
  supplierId: string;
  supplierName: string;
  originalAmount: Decimal;
  amountRecognized: Decimal;
  remainingBalance: Decimal;
  serviceStartDate: Date;
  serviceEndDate: Date;
  nextRecognitionDate: Date | null;
  status: string;
}) {
  return {
    id: row.prepaymentCode,
    description: row.description,
    supplier: { id: row.supplierId, name: row.supplierName },
    originalAmount: d(row.originalAmount),
    amountRecognized: d(row.amountRecognized),
    remainingBalance: d(row.remainingBalance),
    serviceStartDate: formatYmd(row.serviceStartDate),
    serviceEndDate: formatYmd(row.serviceEndDate),
    servicePeriod: servicePeriodLabel(row.serviceStartDate, row.serviceEndDate),
    nextRecognitionDate: formatYmd(row.nextRecognitionDate),
    status: row.status,
  };
}

function mapScheduleItem(row: {
  scheduleCode: string;
  recognitionDate: Date;
  recognitionPeriod: string;
  amountDeductedFromPrepayment: Decimal;
  amountAddedToExpense: Decimal;
  prepaymentBalanceBefore: Decimal;
  prepaymentBalanceAfter: Decimal;
  expenseType: string;
  category: string;
  status: string;
}) {
  return {
    id: row.scheduleCode,
    recognitionDate: formatYmd(row.recognitionDate),
    recognitionPeriod: row.recognitionPeriod,
    amountDeductedFromPrepayment: d(row.amountDeductedFromPrepayment),
    amountAddedToExpense: d(row.amountAddedToExpense),
    prepaymentBalanceBefore: d(row.prepaymentBalanceBefore),
    prepaymentBalanceAfter: d(row.prepaymentBalanceAfter),
    expenseType: row.expenseType,
    category: row.category,
    status: row.status,
  };
}

async function processDueRecognitions(
  userId: string,
  prepaymentId: string,
): Promise<void> {
  const prepayment = await prisma.prepayment.findFirst({
    where: { id: prepaymentId, userId, status: "ACTIVE" },
    include: {
      schedule: {
        where: { status: "SCHEDULED" },
        orderBy: { recognitionDate: "asc" },
      },
    },
  });
  if (!prepayment) return;

  const today = new Date();
  const asOf = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  for (const entry of prepayment.schedule) {
    if (entry.recognitionDate > asOf) break;

    await prisma.$transaction(async (tx) => {
      const locked = await tx.prepaymentScheduleItem.findFirst({
        where: { id: entry.id, status: "SCHEDULED" },
      });
      if (!locked) return;

      const prep = await tx.prepayment.findUnique({ where: { id: prepaymentId } });
      if (!prep || prep.status !== "ACTIVE") return;

      const amount = d(locked.amountDeductedFromPrepayment);
      const expenseNumber = await nextExpenseNumberTx(tx);
      const expense = await tx.expense.create({
        data: {
          userId,
          createdById: userId,
          expenseNumber,
          description: `${prep.description} — ${locked.recognitionPeriod}`,
          category: prep.category,
          expenseType: prep.expenseType,
          amount: new Decimal(amount),
          totalAmount: new Decimal(amount),
          vatInclusive: false,
          paymentType: "Transfer",
          supplierName: prep.supplierName,
          supplierId: prep.supplierId,
          expenseDate: locked.recognitionDate,
          status: SALE_STATUS.PAID,
        },
      });

      const newRecognized = normalizeMoneyAmount(d(prep.amountRecognized) + amount);
      const newRemaining = normalizeMoneyAmount(
        Math.max(0, d(prep.remainingBalance) - amount),
      );

      await tx.prepaymentScheduleItem.update({
        where: { id: locked.id },
        data: {
          status: "RECOGNIZED",
          expenseId: expense.id,
          recognizedAt: new Date(),
        },
      });

      const nextScheduled = await tx.prepaymentScheduleItem.findFirst({
        where: { prepaymentId, status: "SCHEDULED" },
        orderBy: { recognitionDate: "asc" },
      });

      await tx.prepayment.update({
        where: { id: prepaymentId },
        data: {
          amountRecognized: new Decimal(newRecognized),
          remainingBalance: new Decimal(newRemaining),
          nextRecognitionDate: nextScheduled?.recognitionDate ?? null,
          status: newRemaining <= 0.001 ? "FULLY_RECOGNIZED" : "ACTIVE",
        },
      });
    });
  }
}

export const prepaymentsService = {
  async create(
    userId: string,
    data: {
      category: string;
      description: string;
      supplier: { id: string; name: string };
      totalAmount: number;
      paymentDate: string;
      serviceStartDate: string;
      serviceEndDate: string;
      recognitionFrequency: string;
      expenseType: string;
      evidenceUrl: string;
      customSchedule?: Array<{ recognitionDate: string; amount: number }>;
    },
  ) {
    const totalAmount = normalizeMoneyAmount(data.totalAmount);
    if (!(totalAmount > 0)) {
      throw new HttpReplyError(400, "totalAmount must be greater than 0");
    }
    if (!isValidPrepaymentFrequency(data.recognitionFrequency)) {
      throw new HttpReplyError(400, "Invalid recognitionFrequency");
    }

    const supplier = await resolveSupplierDirectory(userId, data.supplier);
    const paymentDate = parseDateOnly(data.paymentDate, "paymentDate");
    const serviceStartDate = parseDateOnly(
      data.serviceStartDate,
      "serviceStartDate",
    );
    const serviceEndDate = parseDateOnly(data.serviceEndDate, "serviceEndDate");
    if (serviceEndDate <= serviceStartDate) {
      throw new HttpReplyError(400, "serviceEndDate must be after serviceStartDate");
    }

    const drafts = buildScheduleDrafts(
      totalAmount,
      serviceStartDate,
      serviceEndDate,
      data.recognitionFrequency,
      data.customSchedule,
    );
    const scheduleSum = normalizeMoneyAmount(
      drafts.reduce((s, r) => s + r.amount, 0),
    );
    if (Math.abs(scheduleSum - totalAmount) > 0.02) {
      throw new HttpReplyError(
        400,
        "Recognition schedule must sum to totalAmount",
      );
    }

    const prepaymentCode = await nextDisplayCode(PREPAYMENT_COUNTER, "PRE");
    let balanceBefore = totalAmount;
    const scheduleRows: Array<{
      scheduleCode: string;
      recognitionDate: Date;
      recognitionPeriod: string;
      amount: number;
      balanceBefore: number;
      balanceAfter: number;
    }> = [];

    for (const draft of drafts) {
      const scheduleCode = await nextDisplayCode(SCHEDULE_COUNTER, "PRS");
      const balanceAfter = normalizeMoneyAmount(balanceBefore - draft.amount);
      scheduleRows.push({
        scheduleCode,
        recognitionDate: draft.recognitionDate,
        recognitionPeriod: draft.recognitionPeriod,
        amount: draft.amount,
        balanceBefore,
        balanceAfter,
      });
      balanceBefore = balanceAfter;
    }

    const row = await prisma.prepayment.create({
      data: {
        userId,
        prepaymentCode,
        category: data.category.trim(),
        description: data.description.trim(),
        supplierId: supplier.id,
        supplierName: supplier.name,
        originalAmount: new Decimal(totalAmount),
        amountRecognized: new Decimal(0),
        remainingBalance: new Decimal(totalAmount),
        paymentDate,
        serviceStartDate,
        serviceEndDate,
        recognitionFrequency: data.recognitionFrequency,
        expenseType: data.expenseType.trim(),
        status: "ACTIVE",
        nextRecognitionDate: scheduleRows[0]?.recognitionDate ?? null,
        evidenceUrls: [data.evidenceUrl.trim()],
        schedule: {
          create: scheduleRows.map((s) => ({
            scheduleCode: s.scheduleCode,
            recognitionDate: s.recognitionDate,
            recognitionPeriod: s.recognitionPeriod,
            amountDeductedFromPrepayment: new Decimal(s.amount),
            amountAddedToExpense: new Decimal(s.amount),
            prepaymentBalanceBefore: new Decimal(s.balanceBefore),
            prepaymentBalanceAfter: new Decimal(s.balanceAfter),
            expenseType: data.expenseType.trim(),
            category: data.category.trim(),
            status: "SCHEDULED",
          })),
        },
      },
      include: { schedule: { orderBy: { recognitionDate: "asc" } } },
    });

    await processDueRecognitions(userId, row.id);
    const refreshed = await findPrepayment(userId, row.prepaymentCode);
    return mapListItem(refreshed!);
  },

  async list(userId: string) {
    const rows = await prisma.prepayment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    for (const row of rows.filter((r) => r.status === "ACTIVE")) {
      await processDueRecognitions(userId, row.id);
    }

    const updated = await prisma.prepayment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    const active = updated.filter((r) => r.status === "ACTIVE");
    const totalRemaining = normalizeMoneyAmount(
      active.reduce((s, r) => s + d(r.remainingBalance), 0),
    );

    const scheduledThisMonth = await prisma.prepaymentScheduleItem.aggregate({
      where: {
        prepayment: { userId },
        status: "SCHEDULED",
        recognitionDate: { gte: monthStart, lt: monthEnd },
      },
      _sum: { amountDeductedFromPrepayment: true },
    });

    const upcoming = await prisma.prepaymentScheduleItem.findMany({
      where: {
        prepayment: { userId, status: "ACTIVE" },
        status: "SCHEDULED",
        recognitionDate: { gte: now },
      },
      orderBy: { recognitionDate: "asc" },
      take: 10,
      include: { prepayment: { select: { prepaymentCode: true, description: true } } },
    });

    return {
      summary: {
        activePrepayments: active.length,
        totalRemainingPrepayments: totalRemaining,
        amountScheduledForRecognitionThisMonth: normalizeMoneyAmount(
          d(scheduledThisMonth._sum.amountDeductedFromPrepayment),
        ),
        upcomingRecognitionEvents: upcoming.map((u) => ({
          prepaymentId: u.prepayment.prepaymentCode,
          description: u.prepayment.description,
          recognitionDate: formatYmd(u.recognitionDate),
          amount: d(u.amountDeductedFromPrepayment),
        })),
      },
      prepayments: updated.map(mapListItem),
    };
  },

  async getById(userId: string, prepaymentIdOrCode: string) {
    let row = await findPrepayment(userId, prepaymentIdOrCode);
    if (!row) throw new HttpReplyError(404, "Prepayment not found");
    if (row.status === "ACTIVE") {
      await processDueRecognitions(userId, row.id);
      row = (await findPrepayment(userId, prepaymentIdOrCode))!;
    }

    const evidence = Array.isArray(row.evidenceUrls)
      ? (row.evidenceUrls as string[])
      : [];

    const recognized = row.schedule.filter((s) => s.status === "RECOGNIZED");
    const scheduled = row.schedule.filter((s) => s.status === "SCHEDULED");
    const original = d(row.originalAmount);
    const totalRecognized = d(row.amountRecognized);

    return {
      id: row.prepaymentCode,
      uuid: row.id,
      description: row.description,
      category: row.category,
      supplier: { id: row.supplierId, name: row.supplierName },
      originalAmount: original,
      amountRecognized: totalRecognized,
      remainingBalance: d(row.remainingBalance),
      serviceStartDate: formatYmd(row.serviceStartDate),
      serviceEndDate: formatYmd(row.serviceEndDate),
      servicePeriod: servicePeriodLabel(row.serviceStartDate, row.serviceEndDate),
      recognitionFrequency: row.recognitionFrequency,
      expenseType: row.expenseType,
      paymentDate: formatYmd(row.paymentDate),
      nextRecognitionDate: formatYmd(row.nextRecognitionDate),
      status: row.status,
      consultant: row.consultantId
        ? { id: row.consultantId, name: row.consultantName ?? "" }
        : null,
      evidence,
      recognitionSummary: {
        originalAmount: original,
        totalRecognized,
        totalRemaining: d(row.remainingBalance),
        recognitionProgress:
          original > 0
            ? normalizeMoneyAmount((totalRecognized / original) * 100)
            : 0,
        totalRecognizedEntries: recognized.length,
        remainingRecognitionEntries: scheduled.length,
      },
      schedule: row.schedule.map(mapScheduleItem),
    };
  },

  async assignConsultant(
    userId: string,
    prepaymentIdOrCode: string,
    data: { consultantId: string; consultantName: string },
  ) {
    const row = await findPrepayment(userId, prepaymentIdOrCode);
    if (!row) throw new HttpReplyError(404, "Prepayment not found");

    const consultant = await prisma.user.findFirst({
      where: { id: data.consultantId.trim() },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!consultant) throw new HttpReplyError(404, "Consultant not found");

    const updated = await prisma.prepayment.update({
      where: { id: row.id },
      data: {
        consultantId: consultant.id,
        consultantName:
          data.consultantName?.trim() ||
          `${consultant.firstName} ${consultant.lastName}`.trim(),
      },
    });

    return mapListItem(updated);
  },

  async addEvidence(
    userId: string,
    prepaymentIdOrCode: string,
    data: { url: string },
  ) {
    const row = await findPrepayment(userId, prepaymentIdOrCode);
    if (!row) throw new HttpReplyError(404, "Prepayment not found");

    const existing = Array.isArray(row.evidenceUrls)
      ? (row.evidenceUrls as string[])
      : [];
    const evidenceUrls = [...existing, data.url.trim()];

    await prisma.prepayment.update({
      where: { id: row.id },
      data: { evidenceUrls },
    });

    return { evidence: evidenceUrls };
  },

  async update(
    userId: string,
    prepaymentIdOrCode: string,
    data: {
      category?: string;
      description?: string;
      supplier?: { id: string; name: string };
      serviceStartDate?: string;
      serviceEndDate?: string;
      recognitionFrequency?: string;
      expenseType?: string;
    },
  ) {
    const row = await findPrepayment(userId, prepaymentIdOrCode);
    if (!row) throw new HttpReplyError(404, "Prepayment not found");
    if (row.status === "CANCELLED" || row.status === "FULLY_RECOGNIZED") {
      throw new HttpReplyError(400, "Prepayment cannot be edited");
    }

    let supplierId = row.supplierId;
    let supplierName = row.supplierName;
    if (data.supplier) {
      const resolved = await resolveSupplierDirectory(userId, data.supplier);
      supplierId = resolved.id;
      supplierName = resolved.name;
    }

    const serviceStartDate = data.serviceStartDate
      ? parseDateOnly(data.serviceStartDate, "serviceStartDate")
      : row.serviceStartDate;
    const serviceEndDate = data.serviceEndDate
      ? parseDateOnly(data.serviceEndDate, "serviceEndDate")
      : row.serviceEndDate;

    await prisma.prepayment.update({
      where: { id: row.id },
      data: {
        ...(data.category !== undefined ? { category: data.category.trim() } : {}),
        ...(data.description !== undefined
          ? { description: data.description.trim() }
          : {}),
        supplierId,
        supplierName,
        serviceStartDate,
        serviceEndDate,
        ...(data.recognitionFrequency !== undefined
          ? { recognitionFrequency: data.recognitionFrequency }
          : {}),
        ...(data.expenseType !== undefined
          ? { expenseType: data.expenseType.trim() }
          : {}),
      },
    });

    if (
      data.serviceStartDate ||
      data.serviceEndDate ||
      data.recognitionFrequency
    ) {
      const remaining = d(row.remainingBalance);
      const futureDrafts = buildScheduleDrafts(
        remaining,
        serviceStartDate,
        serviceEndDate,
        data.recognitionFrequency ?? row.recognitionFrequency,
      );

      await prisma.prepaymentScheduleItem.updateMany({
        where: { prepaymentId: row.id, status: "SCHEDULED" },
        data: { status: "CANCELLED" },
      });

      let balanceBefore = remaining;
      for (const draft of futureDrafts) {
        const scheduleCode = await nextDisplayCode(SCHEDULE_COUNTER, "PRS");
        const balanceAfter = normalizeMoneyAmount(balanceBefore - draft.amount);
        await prisma.prepaymentScheduleItem.create({
          data: {
            prepaymentId: row.id,
            scheduleCode,
            recognitionDate: draft.recognitionDate,
            recognitionPeriod: draft.recognitionPeriod,
            amountDeductedFromPrepayment: new Decimal(draft.amount),
            amountAddedToExpense: new Decimal(draft.amount),
            prepaymentBalanceBefore: new Decimal(balanceBefore),
            prepaymentBalanceAfter: new Decimal(balanceAfter),
            expenseType: data.expenseType?.trim() ?? row.expenseType,
            category: data.category?.trim() ?? row.category,
            status: "SCHEDULED",
          },
        });
        balanceBefore = balanceAfter;
      }

      const next = await prisma.prepaymentScheduleItem.findFirst({
        where: { prepaymentId: row.id, status: "SCHEDULED" },
        orderBy: { recognitionDate: "asc" },
      });
      await prisma.prepayment.update({
        where: { id: row.id },
        data: { nextRecognitionDate: next?.recognitionDate ?? null },
      });
    }

    return this.getById(userId, row.prepaymentCode);
  },

  async cancel(
    userId: string,
    prepaymentIdOrCode: string,
    data: { reason: string },
  ) {
    const row = await findPrepayment(userId, prepaymentIdOrCode);
    if (!row) throw new HttpReplyError(404, "Prepayment not found");
    if (row.status === "FULLY_RECOGNIZED" || row.status === "CANCELLED") {
      throw new HttpReplyError(400, "Prepayment cannot be cancelled");
    }

    await prisma.$transaction([
      prisma.prepaymentScheduleItem.updateMany({
        where: { prepaymentId: row.id, status: "SCHEDULED" },
        data: { status: "CANCELLED" },
      }),
      prisma.prepayment.update({
        where: { id: row.id },
        data: {
          status: "CANCELLED",
          cancelReason: data.reason.trim(),
          remainingBalance: new Decimal(0),
          nextRecognitionDate: null,
        },
      }),
    ]);

    return mapListItem(
      (await findPrepayment(userId, row.prepaymentCode))!,
    );
  },

  /** Active prepayment balances for current-assets integration. */
  async activeBalances(userId: string) {
    const rows = await prisma.prepayment.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    const items = rows.map((r) => ({
      id: r.prepaymentCode,
      supplier: { id: r.supplierId, name: r.supplierName },
      description: r.description,
      originalAmount: d(r.originalAmount),
      amountDeducted: d(r.amountRecognized),
      remainingAmount: d(r.remainingBalance),
      status: r.status,
    }));
    const total = normalizeMoneyAmount(
      items.reduce((s, i) => s + i.remainingAmount, 0),
    );
    return { total, numberOfPrepayments: items.length, items };
  },

  /** Total prepayment payments (for cash/bank adjustment). */
  async totalPaymentsOutflow(userId: string): Promise<number> {
    const rows = await prisma.prepayment.findMany({
      where: { userId, status: { not: "CANCELLED" } },
      select: { originalAmount: true },
    });
    return normalizeMoneyAmount(rows.reduce((s, r) => s + d(r.originalAmount), 0));
  },
};
