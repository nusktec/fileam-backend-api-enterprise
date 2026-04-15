import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { PERCENT } from "../../constants/percentages";
import type { FullReportData } from "../../services/template/pdfTemplates";
import { mergePdfBuffers } from "../../utils/mergePdfBuffers";
import type { ParsedDateRange } from "../../utils/dateRangeQuery";

const MAX_EXPORT_SECTIONS = 48;

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
  const citPayable = taxableProfit * (comp.cit.citRate / PERCENT);
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

export type ReportDownloadResult =
  | { kind: "pdf"; buffer: Buffer; filename: string }
  | { kind: "url"; documentUrl: string; format: string };

/**
 * Resolves report download: generates PDF on the fly (same as mobile) for any stored report row.
 * Falls back to documentUrl when present if PDF generation is unavailable.
 */
export async function getReportDownload(
  linkedUserId: string,
  reportId: string,
): Promise<ReportDownloadResult | null> {
  const report = await prisma.report.findFirst({
    where: { id: reportId, userId: linkedUserId },
  });
  if (!report) return null;

  const { generatePdfForDocument } = await import(
    "../../mobile/services/evidenceVaultPdfService"
  );
  const pdf = await generatePdfForDocument(
    linkedUserId,
    `report-${reportId}`,
  );
  if (pdf) {
    return { kind: "pdf", buffer: pdf.buffer, filename: pdf.filename };
  }

  if (report.documentUrl) {
    return {
      kind: "url",
      documentUrl: report.documentUrl,
      format: report.format,
    };
  }

  return null;
}

export async function listReports(
  linkedUserId: string,
  opts?: {
    page?: number;
    limit?: number;
    reportType?: string;
    dateFrom?: Date;
    dateTo?: Date;
  },
) {
  const where: {
    userId: string;
    reportType?: string;
    generatedAt?: { gte?: Date; lte?: Date };
  } = {
    userId: linkedUserId,
  };
  if (opts?.reportType) where.reportType = opts.reportType;
  if (opts?.dateFrom || opts?.dateTo) {
    where.generatedAt = {};
    if (opts.dateFrom) where.generatedAt.gte = opts.dateFrom;
    if (opts.dateTo) where.generatedAt.lte = opts.dateTo;
  }
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

function monthsInRangeInclusive(
  from: Date,
  to: Date,
  max: number,
): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  let y = from.getFullYear();
  let m = from.getMonth() + 1;
  const endY = to.getFullYear();
  const endM = to.getMonth() + 1;
  while ((y < endY || (y === endY && m <= endM)) && out.length < max) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

async function buildFullReportDataForPeriod(
  linkedUserId: string,
  meta: {
    reportType: string;
    periodLabel: string;
    periodYear: number;
    periodMonth: number;
    generatedAt: Date;
    format: string;
    status: string;
  },
): Promise<FullReportData> {
  const { getReportDataForPeriod } = await import(
    "../../mobile/services/reportDataService"
  );
  const periodData = await getReportDataForPeriod(
    linkedUserId,
    meta.periodYear,
    meta.periodMonth,
  );
  return {
    ...periodData,
    reportType: meta.reportType,
    periodLabel: meta.periodLabel,
    periodYear: meta.periodYear,
    periodMonth: meta.periodMonth,
    generatedAt: meta.generatedAt,
    format: meta.format,
    status: meta.status,
  };
}

/**
 * One long PDF: each stored report (or each month in range) becomes its own
 * multi-page section (full summary tax report for that period), merged in order.
 */
export async function exportAllReportsPdf(
  linkedUserId: string,
  opts?: {
    dateRange?: ParsedDateRange;
    reportType?: string;
  },
): Promise<{ buffer: Buffer; filename: string; sectionCount: number } | null> {
  const where: {
    userId: string;
    reportType?: string;
    generatedAt?: { gte?: Date; lte?: Date };
  } = { userId: linkedUserId };
  if (opts?.reportType) where.reportType = opts.reportType;
  const r = opts?.dateRange;
  if (r?.dateFrom || r?.dateTo) {
    where.generatedAt = {};
    if (r.dateFrom) where.generatedAt.gte = r.dateFrom;
    if (r.dateTo) where.generatedAt.lte = r.dateTo;
  }

  const reportRows = await prisma.report.findMany({
    where,
    orderBy: [
      { periodYear: "asc" },
      { periodMonth: "asc" },
      { generatedAt: "asc" },
    ],
    take: MAX_EXPORT_SECTIONS,
  });

  type SectionMeta = {
    reportType: string;
    periodLabel: string;
    periodYear: number;
    periodMonth: number;
    generatedAt: Date;
    format: string;
    status: string;
  };

  let sections: SectionMeta[];

  if (reportRows.length > 0) {
    sections = reportRows.map((row) => ({
      reportType: row.reportType,
      periodLabel: row.periodLabel,
      periodYear: row.periodYear,
      periodMonth: row.periodMonth,
      generatedAt: row.generatedAt,
      format: row.format,
      status: row.status,
    }));
  } else {
    const now = new Date();
    const from =
      r?.dateFrom ??
      new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);
    const to = r?.dateTo ?? now;
    const months = monthsInRangeInclusive(from, to, MAX_EXPORT_SECTIONS);
    if (months.length === 0) return null;
    const rt = opts?.reportType ?? "Summary Tax Report";
    sections = months.map(({ year, month }) => ({
      reportType: rt,
      periodLabel: `${new Date(year, month - 1).toLocaleString("default", { month: "long" })} ${year}`,
      periodYear: year,
      periodMonth: month,
      generatedAt: new Date(),
      format: "PDF",
      status: "exported",
    }));
  }

  const { generateFullReportPdf } = await import(
    "../../services/template/pdfTemplates"
  );
  const { fetchLogoBuffer } = await import(
    "../../mobile/services/reportDataService"
  );
  const logoBuffer = await fetchLogoBuffer();

  const buffers: Buffer[] = [];
  for (const meta of sections) {
    const full = await buildFullReportDataForPeriod(linkedUserId, meta);
    buffers.push(await generateFullReportPdf(full, logoBuffer));
  }

  const merged = await mergePdfBuffers(buffers);
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    buffer: merged,
    filename: `fileam-all-reports-${stamp}.pdf`,
    sectionCount: sections.length,
  };
}
