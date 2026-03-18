import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

export async function getTaxesSummary(linkedUserId: string) {
  const payables = await prisma.taxPayable.findMany({
    where: { userId: linkedUserId },
    include: { payments: { where: { status: "completed" } } },
  });
  let totalTaxLiability = 0;
  let vatPayable = 0;
  let citPayable = 0;
  let whtCollected = 0;
  const breakdown: Record<string, number> = {
    "Value Added Tax": 0,
    "Companies Income Tax": 0,
    "Withholding Tax": 0,
    "Other Taxes": 0,
  };
  for (const p of payables) {
    const amt = decimalToNumber(p.totalPayable);
    totalTaxLiability += amt;
    if (p.taxType === "VAT") {
      vatPayable += amt;
      breakdown["Value Added Tax"] += amt;
    } else if (p.taxType === "CIT") {
      citPayable += amt;
      breakdown["Companies Income Tax"] += amt;
    } else if (p.taxType === "WHT") {
      whtCollected += amt;
      breakdown["Withholding Tax"] += amt;
    } else {
      breakdown["Other Taxes"] += amt;
    }
  }
  return {
    totalTaxLiability,
    vatPayable,
    citPayable,
    whtCollected,
    breakdown,
  };
}

export async function getVatPaymentReport(linkedUserId: string) {
  const payables = await prisma.taxPayable.findMany({
    where: { userId: linkedUserId, taxType: "VAT" },
    include: { payments: { where: { status: "completed" } } },
  });
  let totalVatCollected = 0;
  let totalVatPaid = 0;
  for (const p of payables) {
    totalVatCollected += decimalToNumber(p.totalPayable);
    totalVatPaid += p.payments.reduce(
      (s, r) => s + decimalToNumber(r.amountPaid),
      0,
    );
  }
  return {
    totalVatCollected,
    totalVatPaid,
    netVatPayable: totalVatCollected - totalVatPaid,
    filingStatus: payables.length > 0 ? "Filed" : "Not Filed",
    breakdown: {
      outputVatOnSales: totalVatCollected - totalVatPaid,
      inputVatOnPurchases: totalVatPaid,
      vatOnImportedServices: 0,
      vatAdjustment: 0,
    },
  };
}

export async function getCitComputationReport(linkedUserId: string) {
  const { getClientFinancialSummary } = await import("./clientDataHelper");
  const { taxComputationService } = await import("../../mobile/services/taxComputationService");
  const summary = await getClientFinancialSummary(linkedUserId);
  const now = new Date();
  const comp = await taxComputationService.getForPeriod(
    linkedUserId,
    now.getFullYear(),
    now.getMonth() + 1,
  );
  const taxableProfit = Math.max(0, summary.netProfit);
  const citPayable = taxableProfit * (comp.cit.citRate / 100);
  return {
    netProfit: summary.netProfit,
    taxAdjustments: 0,
    adjustedProfit: taxableProfit,
    citRate: comp.cit.citRate,
    citPayable,
    breakdown: comp.cit,
  };
}

export async function getWhtReport(linkedUserId: string) {
  const payables = await prisma.taxPayable.findMany({
    where: { userId: linkedUserId, taxType: "WHT" },
  });
  const total = payables.reduce(
    (s, p) => s + decimalToNumber(p.totalPayable),
    0,
  );
  return {
    totalWhtCollected: total,
    breakdown: payables.map((p) => ({
      period: `${p.periodMonth}/${p.periodYear}`,
      amount: decimalToNumber(p.totalPayable),
    })),
  };
}

export async function getTaxWithholdingReport(linkedUserId: string) {
  return getWhtReport(linkedUserId);
}

export async function getPayeComputationReport(linkedUserId: string) {
  const { employeesService } = await import("../../mobile/services/employeesService");
  const obligations = await employeesService.getObligations(linkedUserId);
  return {
    payeAmount: obligations.paye.amount,
    dueDate: obligations.paye.dueDate,
    note: obligations.paye.note,
    breakdown: obligations,
  };
}

export async function getReportDownload(
  linkedUserId: string,
  reportId: string,
) {
  const report = await prisma.report.findFirst({
    where: { id: reportId, userId: linkedUserId },
  });
  if (!report?.documentUrl) return null;
  return { documentUrl: report.documentUrl, format: report.format };
}

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
