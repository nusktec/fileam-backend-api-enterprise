import { prisma } from "../../config/database";

export async function listReports(
  linkedUserId: string,
  opts?: { page?: number; limit?: number; reportType?: string },
) {
  const where: { userId: string; reportType?: string } = {
    userId: linkedUserId,
  };
  if (opts?.reportType) where.reportType = opts.reportType;
  const page = opts?.page ?? 1;
  const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { generatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.report.count({ where }),
  ]);
  return {
    data: reports.map((r) => ({
      id: r.id,
      reportType: r.reportType,
      periodLabel: r.periodLabel,
      periodYear: r.periodYear,
      periodMonth: r.periodMonth,
      generatedAt: r.generatedAt,
      format: r.format,
      status: r.status,
    })),
    total,
    page,
    limit,
  };
}
