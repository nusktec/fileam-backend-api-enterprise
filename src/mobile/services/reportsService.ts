import { prisma } from "../../config/database";
import { REPORT_TYPES } from "../../constants/filings";

export const reportsService = {
  async list(
    userId: string,
    filters?: { reportType?: string },
    opts?: { page?: number; limit?: number; sortOrder?: "ASC" | "DESC" },
  ) {
    const where: { userId: string; reportType?: string } = { userId };
    if (filters?.reportType) where.reportType = filters.reportType;
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 10), 100);
    const order = opts?.sortOrder === "ASC" ? "asc" : "desc";

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        orderBy: { generatedAt: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.report.count({ where }),
    ]);
    const data = reports.map((r) => ({
      id: r.id,
      name: `${r.reportType} - ${r.periodLabel}`,
      reportType: r.reportType,
      periodLabel: r.periodLabel,
      periodYear: r.periodYear,
      periodMonth: r.periodMonth,
      generatedAt: r.generatedAt,
      format: r.format,
      status: r.status,
    }));
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async getById(userId: string, reportId: string) {
    const r = await prisma.report.findFirst({
      where: { id: reportId, userId },
    });
    if (!r) return null;
    return {
      id: r.id,
      reportType: r.reportType,
      periodLabel: r.periodLabel,
      periodYear: r.periodYear,
      periodMonth: r.periodMonth,
      generatedAt: r.generatedAt,
      format: r.format,
      documentUrl: r.documentUrl ?? undefined,
      evidenceVaultId: r.evidenceVaultId ?? undefined,
      status: r.status,
    };
  },

  getReportTypes() {
    return REPORT_TYPES.map((t) => ({ id: t, name: t }));
  },

  async getPeriods(userId: string, reportType?: string) {
    const payables = await prisma.taxPayable.findMany({
      where: { userId },
      select: { periodYear: true, periodMonth: true },
      distinct: ["periodYear", "periodMonth"],
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    });
    const periods = payables.map((p) => ({
      year: p.periodYear,
      month: p.periodMonth,
      label: `${new Date(p.periodYear, p.periodMonth - 1).toLocaleString("default", { month: "long" })} ${p.periodYear}`,
      value: `${p.periodYear}-${String(p.periodMonth).padStart(2, "0")}`,
    }));
    return periods;
  },

  async generate(
    userId: string,
    params: {
      reportType: string;
      periodYear: number;
      periodMonth: number;
      format?: string;
    },
  ) {
    const periodLabel = `${new Date(params.periodYear, params.periodMonth - 1).toLocaleString("default", { month: "long" })} ${params.periodYear}`;
    const report = await prisma.report.create({
      data: {
        userId,
        reportType: params.reportType,
        periodLabel,
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
        generatedAt: new Date(),
        format: params.format ?? "PDF",
        status: "stored",
      },
    });
    return {
      id: report.id,
      reportType: report.reportType,
      periodLabel: report.periodLabel,
      generatedAt: report.generatedAt,
      format: report.format,
      status: report.status,
    };
  },

  async getDownloadUrl(
    userId: string,
    reportId: string,
  ): Promise<string | null> {
    const r = await prisma.report.findFirst({
      where: { id: reportId, userId },
      select: { documentUrl: true },
    });
    return r?.documentUrl ?? null;
  },

  async getVaultLink(userId: string, reportId: string): Promise<string | null> {
    const r = await prisma.report.findFirst({
      where: { id: reportId, userId },
      select: { evidenceVaultId: true },
    });
    return r?.evidenceVaultId ?? null;
  },
};
