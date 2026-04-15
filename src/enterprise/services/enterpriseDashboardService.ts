import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  ENTERPRISE_POTENTIAL_TAX_SAVINGS_CAP_NGN,
  ENTERPRISE_POTENTIAL_TAX_SAVINGS_RATE,
  ENTERPRISE_POTENTIAL_TAX_SAVINGS_WEEKLY_CAP_NGN,
  ENTERPRISE_POTENTIAL_TAX_SAVINGS_WEEKLY_RATE,
} from "../../constants/percentages";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function hoursAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
}

export async function getGlobalDashboard(consultantUserId: string) {
  const connections = await prisma.consultantConnection.findMany({
    where: { consultantUserId, status: "active" },
    select: { userId: true },
  });
  const clientUserIds = connections.map((c) => c.userId);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  let totalClients = clientUserIds.length;
  let totalClientsThisWeek = 0;
  let taxDueThisMonth = 0;
  let taxDueThisMonthThisWeek = 0;
  let potentialTaxSavings = 0;
  let potentialTaxSavingsThisWeek = 0;
  let complianceRiskCount = 0;
  let complianceRiskThisWeek = 0;

  const recentActivities: Array<{
    id: string;
    clientName: string;
    activity: string;
    timestamp: Date;
    hoursAgo: number;
  }> = [];

  if (clientUserIds.length === 0) {
    return {
      totalClients: { value: 0, thisWeek: 0 },
      taxDueThisMonth: { value: 0, thisWeek: 0 },
      potentialTaxSavings: { value: 0, thisWeek: 0 },
      complianceRiskAlert: {
        level: "low" as const,
        message: "No clients yet",
        thisWeek: 0,
      },
      recentActivities: [],
    };
  }

  const [connectionsWithUsers, payables, users] = await Promise.all([
    prisma.consultantConnection.findMany({
      where: { consultantUserId, status: "active" },
      include: {
        user: {
          select: {
            id: true,
            organizationName: true,
            firstName: true,
            lastName: true,
            updatedAt: true,
          },
        },
        invitation: { select: { invitedBusinessName: true } },
      },
    }),
    prisma.taxPayable.findMany({
      where: { userId: { in: clientUserIds } },
      include: { payments: { where: { status: "completed" } } },
    }),
    prisma.user.findMany({
      where: { id: { in: clientUserIds } },
      select: { id: true, organizationName: true, firstName: true, lastName: true, updatedAt: true },
    }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  for (const p of payables) {
    const totalPayable = decimalToNumber(p.totalPayable);
    const totalPaid = p.payments.reduce(
      (s, r) => s + decimalToNumber(r.amountPaid),
      0,
    );
    const due = new Date(p.filingDueDate);
    due.setHours(0, 0, 0, 0);

    if (p.periodYear === thisYear && p.periodMonth === thisMonth) {
      const remaining = totalPayable - totalPaid;
      if (remaining > 0) {
        taxDueThisMonth += remaining;
      }
    }

    const isOverdue = due < today && (p.status !== "paid" && totalPaid < totalPayable);
    if (isOverdue) complianceRiskCount++;
  }

  potentialTaxSavings = Math.min(
    taxDueThisMonth * ENTERPRISE_POTENTIAL_TAX_SAVINGS_RATE,
    ENTERPRISE_POTENTIAL_TAX_SAVINGS_CAP_NGN,
  );
  potentialTaxSavingsThisWeek = Math.min(
    potentialTaxSavings * ENTERPRISE_POTENTIAL_TAX_SAVINGS_WEEKLY_RATE,
    ENTERPRISE_POTENTIAL_TAX_SAVINGS_WEEKLY_CAP_NGN,
  );

  const conns = connectionsWithUsers.filter((c) => c.createdAt >= weekStart);
  totalClientsThisWeek = conns.length;

  for (const conn of connectionsWithUsers) {
    const user = conn.user;
    const businessName =
      conn.invitation?.invitedBusinessName ??
      user.organizationName ??
      (`${user.firstName} ${user.lastName}`.trim() || "Unknown");

    const updatedAt = user.updatedAt;
    if (updatedAt) {
      recentActivities.push({
        id: `activity-${conn.userId}-${updatedAt.getTime()}`,
        clientName: businessName,
        activity: "Updated their profile",
        timestamp: updatedAt,
        hoursAgo: hoursAgo(updatedAt),
      });
    }
  }

  recentActivities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const topActivities = recentActivities.slice(0, 10);

  let complianceLevel: "low" | "medium" | "high" = "low";
  let complianceMessage = "All filings on track";
  if (complianceRiskCount > 5) {
    complianceLevel = "high";
    complianceMessage = `${complianceRiskCount} overdue filings require attention`;
  } else if (complianceRiskCount > 0) {
    complianceLevel = "medium";
    complianceMessage = `${complianceRiskCount} filing(s) overdue`;
  }

  return {
    totalClients: { value: totalClients, thisWeek: totalClientsThisWeek },
    taxDueThisMonth: { value: taxDueThisMonth, thisWeek: taxDueThisMonthThisWeek },
    potentialTaxSavings: { value: potentialTaxSavings, thisWeek: potentialTaxSavingsThisWeek },
    complianceRiskAlert: {
      level: complianceLevel,
      message: complianceMessage,
      thisWeek: complianceRiskThisWeek,
    },
    recentActivities: topActivities,
  };
}
