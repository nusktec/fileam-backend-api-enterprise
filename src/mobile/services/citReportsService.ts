import PDFDocument from "pdfkit";
import { prisma } from "../../config/database";
import { citDueDateForYear } from "../../constants/citFiling";
import { HttpReplyError } from "../../utils/httpReplyError";
import { lagosYear } from "../../utils/lagosCalendar";
import { citFilingService } from "./citFilingService";
import { financialPositionService } from "./financialPositionService";
import { assetsService } from "./assetsService";

export const CIT_REPORT_IDS = [
  "profit-loss",
  "balance-sheet",
  "cash-flow",
  "tax-liability",
  "ledgerwatch",
  "compliance",
  "history",
] as const;

export type CitReportId = (typeof CIT_REPORT_IDS)[number];

const CIT_REPORT_TITLES: Record<CitReportId, string> = {
  "profit-loss": "Profit & Loss",
  "balance-sheet": "Balance Sheet",
  "cash-flow": "Cash Flow",
  "tax-liability": "Tax Liability",
  "ledgerwatch": "LedgerWatch Summary",
  "compliance": "Compliance Status",
  history: "CIT Filing History",
};

const PRIMARY = "#008b8b";

function isCitReportId(value: string): value is CitReportId {
  return (CIT_REPORT_IDS as readonly string[]).includes(value);
}

function assertYear(year: unknown): number {
  const n = Number(year);
  if (!Number.isInteger(n) || n < 1000 || n > 9999) {
    throw new HttpReplyError(400, "year is required and must be a valid YYYY integer");
  }
  if (n > lagosYear()) {
    throw new HttpReplyError(400, "year cannot be a future year");
  }
  return n;
}

function money(n: number): string {
  return new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function renderSimplePdf(opts: {
  title: string;
  year: number;
  lines: { label: string; value: string }[];
  note?: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).fillColor(PRIMARY).text(opts.title);
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor("#333").text(`Year ${opts.year}`);
    doc.moveDown(1);
    doc.fontSize(10).fillColor("#111");
    if (opts.lines.length === 0) {
      doc.text("No rows for this year.");
    } else {
      for (const line of opts.lines) {
        doc.text(`${line.label}: ${line.value}`);
      }
    }
    if (opts.note) {
      doc.moveDown(1);
      doc.fontSize(9).fillColor("#555").text(opts.note);
    }
    doc.end();
  });
}

export const citReportsService = {
  async list(userId: string, yearQuery: unknown) {
    const year = assertYear(yearQuery);
    const reports = CIT_REPORT_IDS.map((id) => ({
      id,
      title: CIT_REPORT_TITLES[id],
      url: `/api/v1/mobile/filings/cit/reports/files/${id}.pdf?year=${year}`,
    }));
    return { year, reports };
  },

  async file(userId: string, reportId: string, yearQuery: unknown): Promise<{
    filename: string;
    buffer: Buffer;
  }> {
    const year = assertYear(yearQuery);
    const id = reportId.replace(/\.pdf$/i, "");
    if (!isCitReportId(id)) {
      throw new HttpReplyError(400, "Unknown CIT report id");
    }
    const buffer = await this.buildPdf(userId, id, year);
    return { filename: `${id}-${year}.pdf`, buffer };
  },

  async buildPdf(userId: string, id: CitReportId, year: number): Promise<Buffer> {
    const title = CIT_REPORT_TITLES[id];
    if (id === "profit-loss") {
      const calc = await citFilingService.getCalculation(userId, year);
      const c = calc.computation;
      return renderSimplePdf({
        title,
        year,
        lines: [
          { label: "Turnover", value: money(c.turnover) },
          { label: "Accounting profit", value: money(c.accountingProfit) },
          { label: "Assessable profit", value: money(c.assessableProfit) },
          { label: "Chargeable profit", value: money(c.chargeableProfit) },
        ],
        note: "Turnover, expenses, and accounting profit for the year.",
      });
    }
    if (id === "balance-sheet") {
      const position = await financialPositionService.get(userId);
      const current = await assetsService.getCurrentAssetsSnapshot(userId);
      return renderSimplePdf({
        title,
        year,
        lines: [
          { label: "Current assets", value: money(current.totalCurrentAssets) },
          { label: "Cash", value: money(current.cash.total) },
          { label: "Bank", value: money(current.bankBalances.total) },
          { label: "Total assets", value: money(position.summary.asset.amount) },
        ],
        note: "Company assets at year end.",
      });
    }
    if (id === "cash-flow") {
      const current = await assetsService.getCurrentAssetsSnapshot(userId);
      return renderSimplePdf({
        title,
        year,
        lines: [
          { label: "Cash", value: money(current.cash.total) },
          { label: "Bank", value: money(current.bankBalances.total) },
        ],
        note: "Bank and cash movements for the year.",
      });
    }
    if (id === "tax-liability") {
      const calc = await citFilingService.getCalculation(userId, year);
      const c = calc.computation;
      return renderSimplePdf({
        title,
        year,
        lines: [
          { label: "CIT amount", value: money(c.citAmount) },
          { label: "Development levy", value: money(c.developmentLevy) },
          { label: "WHT applied", value: money(c.whtApplied) },
          { label: "CIT payable", value: money(c.citPayable) },
          { label: "Due date", value: citDueDateForYear(year) },
        ],
        note: "CIT payable after WHT credits, including development levy.",
      });
    }
    if (id === "ledgerwatch") {
      return renderSimplePdf({
        title,
        year,
        lines: [],
        note: "Vault findings and exceptions for the year.",
      });
    }
    if (id === "compliance") {
      const existing = await prisma.taxPayable.findUnique({
        where: {
          userId_taxType_periodYear_periodMonth: {
            userId,
            taxType: "CIT",
            periodYear: year,
            periodMonth: 12,
          },
        },
      });
      return renderSimplePdf({
        title,
        year,
        lines: [
          { label: "Due date", value: citDueDateForYear(year) },
          {
            label: "Status",
            value: existing?.submittedAt
              ? existing.status === "paid"
                ? "paid"
                : "submitted"
              : "pending",
          },
          { label: "Workspace step", value: String(existing?.currentStep ?? 1) },
        ],
        note: "Filing progress and the 30 June due date.",
      });
    }
    const history = await prisma.taxPayable.findMany({
      where: { userId, taxType: "CIT", periodYear: { lt: year } },
      orderBy: { periodYear: "desc" },
    });
    return renderSimplePdf({
      title,
      year,
      lines:
        history.length === 0
          ? []
          : history.map((row) => ({
              label: String(row.periodYear),
              value: `${row.submittedAt ? "filed" : "open"} · ${money(Number(row.totalPayable))}`,
            })),
      note: "Prior-year CIT returns on record.",
    });
  },
};
