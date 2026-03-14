import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function periodLabel(year: number, month: number): string {
  return `${new Date(year, month - 1).toLocaleString("default", { month: "long" })} ${year}`;
}

export async function getComplianceStats(consultantUserId: string) {
  const connections = await prisma.consultantConnection.findMany({
    where: { consultantUserId, status: "active" },
    select: { userId: true },
  });
  const clientUserIds = connections.map((c) => c.userId);
  if (clientUserIds.length === 0) {
    return {
      pendingFilings: 0,
      paymentDues: 0,
      completedFilings: 0,
    };
  }

  const payables = await prisma.taxPayable.findMany({
    where: { userId: { in: clientUserIds } },
    include: { payments: { where: { status: "completed" } } },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let pendingFilings = 0;
  let paymentDues = 0;
  let completedFilings = 0;

  for (const p of payables) {
    const totalPayable = decimalToNumber(p.totalPayable);
    const totalPaid = p.payments.reduce(
      (s, r) => s + decimalToNumber(r.amountPaid),
      0,
    );
    const due = new Date(p.filingDueDate);
    due.setHours(0, 0, 0, 0);

    if (p.status === "paid" || totalPaid >= totalPayable) {
      completedFilings++;
    } else if (p.submittedAt) {
      paymentDues++;
    } else {
      pendingFilings++;
    }
  }

  return {
    pendingFilings,
    paymentDues,
    completedFilings,
  };
}

export async function getUpcomingDeadlines(
  consultantUserId: string,
  opts?: { limit?: number },
) {
  const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
  const connections = await prisma.consultantConnection.findMany({
    where: { consultantUserId, status: "active" },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          organizationName: true,
          email: true,
        },
      },
    },
  });
  const clientUserIds = connections.map((c) => c.userId);
  if (clientUserIds.length === 0) {
    return [];
  }

  const payables = await prisma.taxPayable.findMany({
    where: { userId: { in: clientUserIds } },
    orderBy: { filingDueDate: "asc" },
    take: limit * 2,
    include: { payments: { where: { status: "completed" } } },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const userById = new Map(connections.map((c) => [c.userId, c.user]));

  const rows = payables.map((p) => {
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

    const user = userById.get(p.userId);
    const clientName =
      user?.organizationName ??
      [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ??
      user?.email ??
      "Unknown";

    return {
      id: p.id,
      clientId: p.userId,
      client: clientName,
      taxType: p.taxType,
      periodLabel: periodLabel(p.periodYear, p.periodMonth),
      deadline: p.filingDueDate,
      status,
      action: "view",
    };
  });

  return rows.slice(0, limit);
}
