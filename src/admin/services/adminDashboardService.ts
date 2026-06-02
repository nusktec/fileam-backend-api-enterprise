import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";

function n(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const adminDashboardService = {
  async getMetrics() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [
      totalUsers,
      verifiedUsers,
      onboardingComplete,
      enterpriseConsultants,
      totalCompanies,
      linkedClients,
      totalSales,
      salesThisMonth,
      totalExpenses,
      expensesThisMonth,
      taxPayablesPending,
      activeConnections,
      pendingInvitations,
      pendingConsultantOnboarding,
      accountDeletionRequests,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { verified: true } }),
      prisma.user.count({ where: { onboardingComplete: true } }),
      prisma.user.count({ where: { enterpriseOnboardingComplete: true } }),
      prisma.company.count(),
      prisma.company.count({ where: { linkedUserId: { not: null } } }),
      prisma.sale.aggregate({ _sum: { totalAmount: true }, _count: true }),
      prisma.sale.aggregate({
        where: { saleDate: { gte: startOfMonth } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.expense.aggregate({ _sum: { totalAmount: true }, _count: true }),
      prisma.expense.aggregate({
        where: { expenseDate: { gte: startOfMonth } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.taxPayable.count({ where: { status: "pending" } }),
      prisma.consultantConnection.count({ where: { status: "active" } }),
      prisma.invitation.count({ where: { status: "pending" } }),
      prisma.consultantOnboardingSession.count({
        where: { status: "pending" },
      }),
      prisma.user.count({ where: { requestDelete: true } }),
    ]);

    const salesVolume = n(totalSales._sum.totalAmount);
    const expensesVolume = n(totalExpenses._sum.totalAmount);
    const salesVolumeThisMonth = n(salesThisMonth._sum.totalAmount);
    const salesCount = totalSales._count;
    const expensesCount = totalExpenses._count;

    return {
      users: {
        total: totalUsers,
        verified: verifiedUsers,
        onboardingComplete,
        accountDeletionRequests,
        unverified: totalUsers - verifiedUsers,
      },
      consultants: {
        onboarded: enterpriseConsultants,
        companies: totalCompanies,
        linkedClients,
        activeConnections,
        pendingInvitations,
      },
      usage: {
        salesCount,
        expensesCount,
        salesVolume,
        expensesVolume,
        salesVolumeThisMonth,
        salesCountThisMonth: salesThisMonth._count,
        expensesVolumeThisMonth: n(expensesThisMonth._sum.totalAmount),
        expensesCountThisMonth: expensesThisMonth._count,
        netPlatformVolume: salesVolume - expensesVolume,
        taxPayablesPending,
      },
      sales: {
        totalVolume: salesVolume,
        totalCount: salesCount,
        volumeThisMonth: salesVolumeThisMonth,
        countThisMonth: salesThisMonth._count,
      },
      onboarding: {
        usersOnboarded: onboardingComplete,
        consultantPending: pendingConsultantOnboarding,
        invitationsPending: pendingInvitations,
      },
      enterprise: {
        consultantsOnboarded: enterpriseConsultants,
        companies: totalCompanies,
        linkedClients,
        pendingConsultantOnboarding,
      },
      platform: {
        activeConsultantConnections: activeConnections,
        pendingInvitations,
        taxPayablesPending,
      },
      books: {
        salesVolume,
        salesCount,
        salesVolumeThisMonth,
        salesCountThisMonth: salesThisMonth._count,
        expensesVolume,
        expensesCount,
        expensesVolumeThisMonth: n(expensesThisMonth._sum.totalAmount),
        expensesCountThisMonth: expensesThisMonth._count,
        netPlatformVolume: salesVolume - expensesVolume,
      },
    };
  },

  async getCharts(monthsBack = 12) {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - monthsBack + 1, 1);

    const [sales, expenses, users, registrations] = await Promise.all([
      prisma.sale.findMany({
        where: { saleDate: { gte: start } },
        select: { saleDate: true, totalAmount: true, status: true },
      }),
      prisma.expense.findMany({
        where: { expenseDate: { gte: start } },
        select: { expenseDate: true, totalAmount: true, category: true },
      }),
      prisma.user.findMany({
        where: { createdAt: { gte: start } },
        select: { createdAt: true, onboardingComplete: true },
      }),
      prisma.user.findMany({
        where: { enterpriseOnboardingComplete: true, createdAt: { gte: start } },
        select: { createdAt: true },
      }),
    ]);

    const revenueByMonth = new Map<string, number>();
    const expenseByMonth = new Map<string, number>();
    const usersByMonth = new Map<string, number>();
    const consultantsByMonth = new Map<string, number>();
    const salesCountByMonth = new Map<string, number>();

    for (let i = 0; i < monthsBack; i++) {
      const d = new Date(end.getFullYear(), end.getMonth() - (monthsBack - 1 - i), 1);
      const k = monthKey(d);
      revenueByMonth.set(k, 0);
      expenseByMonth.set(k, 0);
      usersByMonth.set(k, 0);
      consultantsByMonth.set(k, 0);
      salesCountByMonth.set(k, 0);
    }

    for (const s of sales) {
      const k = monthKey(s.saleDate);
      revenueByMonth.set(k, (revenueByMonth.get(k) ?? 0) + n(s.totalAmount));
      salesCountByMonth.set(k, (salesCountByMonth.get(k) ?? 0) + 1);
    }
    for (const e of expenses) {
      const k = monthKey(e.expenseDate);
      expenseByMonth.set(k, (expenseByMonth.get(k) ?? 0) + n(e.totalAmount));
    }
    for (const u of users) {
      const k = monthKey(u.createdAt);
      usersByMonth.set(k, (usersByMonth.get(k) ?? 0) + 1);
    }
    for (const c of registrations) {
      const k = monthKey(c.createdAt);
      consultantsByMonth.set(k, (consultantsByMonth.get(k) ?? 0) + 1);
    }

    const series = [...revenueByMonth.keys()].sort().map((month) => ({
      month,
      revenue: Math.round(revenueByMonth.get(month) ?? 0),
      expenses: Math.round(expenseByMonth.get(month) ?? 0),
      net:
        Math.round((revenueByMonth.get(month) ?? 0) -
        (expenseByMonth.get(month) ?? 0)),
      newUsers: usersByMonth.get(month) ?? 0,
      newConsultants: consultantsByMonth.get(month) ?? 0,
      salesCount: salesCountByMonth.get(month) ?? 0,
    }));

    const expenseByCategory: Record<string, number> = {};
    for (const e of expenses) {
      const cat = e.category?.trim() || "Other";
      expenseByCategory[cat] =
        (expenseByCategory[cat] ?? 0) + n(e.totalAmount);
    }
    const categoryBreakdown = Object.entries(expenseByCategory)
      .map(([category, amount]) => ({ category, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 12);

    const saleStatusBreakdown: Record<string, number> = {};
    for (const s of sales) {
      saleStatusBreakdown[s.status] = (saleStatusBreakdown[s.status] ?? 0) + 1;
    }

    return {
      monthlySeries: series,
      expenseCategoryBreakdown: categoryBreakdown,
      saleStatusBreakdown: Object.entries(saleStatusBreakdown).map(
        ([status, count]) => ({ status, count }),
      ),
    };
  },
};
