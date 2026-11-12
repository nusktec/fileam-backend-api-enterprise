import { prisma } from "../../../config/database";
import { PIPELINE_STAGES, RECORD_TYPES } from "../constants";
import { parsePositiveInt } from "../utils";

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function ensureSyncState(clientUserId: string) {
  return prisma.enterpriseSyncState.upsert({
    where: { clientUserId },
    create: { clientUserId, syncStatus: "active", lastSyncAt: new Date() },
    update: {},
  });
}

export const featuresSyncService = {
  async getStatus(clientUserId: string) {
    const state = await ensureSyncState(clientUserId);
    const today = startOfUtcDay();

    const [
      salesToday,
      expensesToday,
      pendingReview,
      conflicts,
      salesEvidence,
      salesTotal,
      expensesEvidence,
      expensesTotal,
    ] = await Promise.all([
      prisma.sale.count({
        where: { userId: clientUserId, createdAt: { gte: today }, undoAt: null },
      }),
      prisma.expense.count({
        where: { userId: clientUserId, createdAt: { gte: today }, undoAt: null },
      }),
      prisma.enterprisePipelineStage.count({
        where: {
          clientUserId,
          pipelineStage: { not: PIPELINE_STAGES.FINALIZED },
        },
      }),
      prisma.enterpriseSyncConflict.count({
        where: { clientUserId, status: "unresolved" },
      }),
      prisma.sale.count({
        where: {
          userId: clientUserId,
          undoAt: null,
          evidenceVaultId: { not: null },
        },
      }),
      prisma.sale.count({ where: { userId: clientUserId, undoAt: null } }),
      prisma.expense.count({
        where: {
          userId: clientUserId,
          undoAt: null,
          receiptUrl: { not: null },
        },
      }),
      prisma.expense.count({ where: { userId: clientUserId, undoAt: null } }),
    ]);

    const modules = new Set<string>();
    if (salesToday > 0) modules.add("Sales");
    if (expensesToday > 0) modules.add("Expenses");

    const unstagedSales = await prisma.sale.count({
      where: {
        userId: clientUserId,
        undoAt: null,
        NOT: {
          id: {
            in: (
              await prisma.enterprisePipelineStage.findMany({
                where: { clientUserId, recordType: RECORD_TYPES.SALE },
                select: { recordId: true },
              })
            ).map((r) => r.recordId),
          },
        },
      },
    });
    const unstagedExpenses = await prisma.expense.count({
      where: {
        userId: clientUserId,
        undoAt: null,
        NOT: {
          id: {
            in: (
              await prisma.enterprisePipelineStage.findMany({
                where: { clientUserId, recordType: RECORD_TYPES.EXPENSE },
                select: { recordId: true },
              })
            ).map((r) => r.recordId),
          },
        },
      },
    });

    return {
      lastSyncAt: (state.lastSyncAt ?? state.updatedAt).toISOString(),
      syncStatus: state.syncStatus,
      receivedToday: salesToday + expensesToday,
      receivedModules: modules.size,
      pendingReview: pendingReview + unstagedSales + unstagedExpenses,
      conflicts,
      evidenceMatchedCount: salesEvidence + expensesEvidence,
      evidenceTotal: salesTotal + expensesTotal,
    };
  },

  async getActivity(
    clientUserId: string,
    pageRaw?: unknown,
    limitRaw?: unknown,
  ) {
    const page = parsePositiveInt(pageRaw, 1);
    const limit = parsePositiveInt(limitRaw, 20);
    const [total, rows] = await Promise.all([
      prisma.enterpriseSyncActivity.count({ where: { clientUserId } }),
      prisma.enterpriseSyncActivity.findMany({
        where: { clientUserId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      activity: rows.map((r) => ({
        id: r.id,
        module: r.module,
        description: r.description,
        createdAt: r.createdAt.toISOString(),
        recordCount: r.recordCount,
        hasConflict: r.hasConflict,
        badge: r.badge,
      })),
      pagination: { total, page, limit },
    };
  },

  async getConflicts(clientUserId: string) {
    const rows = await prisma.enterpriseSyncConflict.findMany({
      where: { clientUserId, status: "unresolved" },
      orderBy: { createdAt: "desc" },
    });
    return {
      conflicts: rows.map((r) => ({
        id: r.id,
        module: r.module,
        recordId: r.recordId,
        description: r.description,
        createdAt: r.createdAt.toISOString(),
        mobileValue: r.mobileValue,
        enterpriseValue: r.enterpriseValue,
        status: r.status,
      })),
    };
  },

  async pull(clientUserId: string) {
    const today = startOfUtcDay();
    const [sales, expenses] = await Promise.all([
      prisma.sale.findMany({
        where: { userId: clientUserId, createdAt: { gte: today }, undoAt: null },
        select: { id: true },
      }),
      prisma.expense.findMany({
        where: {
          userId: clientUserId,
          createdAt: { gte: today },
          undoAt: null,
        },
        select: { id: true },
      }),
    ]);

    const newRecords = sales.length + expenses.length;
    const pulledAt = new Date();

    await prisma.enterpriseSyncState.upsert({
      where: { clientUserId },
      create: {
        clientUserId,
        lastSyncAt: pulledAt,
        syncStatus: "active",
      },
      update: { lastSyncAt: pulledAt, syncStatus: "active" },
    });

    if (newRecords > 0) {
      const modules: string[] = [];
      if (sales.length) modules.push("Sales");
      if (expenses.length) modules.push("Expenses");
      await prisma.enterpriseSyncActivity.create({
        data: {
          clientUserId,
          module: modules.join(", ") || "Sync",
          description: `${newRecords} record${newRecords === 1 ? "" : "s"} received from mobile`,
          recordCount: newRecords,
          hasConflict: false,
          badge: `${newRecords} record${newRecords === 1 ? "" : "s"}`,
        },
      });
    }

    return {
      pulledAt: pulledAt.toISOString(),
      newRecords,
    };
  },
};
