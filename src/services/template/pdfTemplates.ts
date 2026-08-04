/**
 * PDF Templates - Email design pattern for professional transaction documents.
 * Consistent branding: Fileam logo, primary color, structured layout.
 */
import PDFDocument from "pdfkit";
import type { Decimal } from "@prisma/client/runtime/library";
import {
  amountColumnX,
  drawFittedCellText,
  drawKeyValueBox,
  ensurePageSpace,
  getPdfLayout,
  tableColumns,
  textHeight,
  truncateText,
} from "./pdfLayout";

const PRIMARY_COLOR = "#008b8b";
const DOMAIN = "https://fileam.app";

function toNum(d: Decimal | number | null | undefined): number {
  if (d == null) return 0;
  return typeof d === "number" ? d : Number(d);
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-NG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Format amount with currency code (e.g. NGN 1,234,567.89). Uses code not symbol for PDF compatibility. */
function formatCurrency(amount: number, currency = "NGN"): string {
  const formatted = new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(amount);
  return `${currency} ${formatted}`;
}

/** Alias for NGN amounts in reports. */
function formatNaira(amount: number): string {
  return formatCurrency(amount, "NGN");
}

/** Compact amount for dense table columns (currency shown in report header). */
function formatTableAmount(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(amount);
}

export interface InvoiceData {
  invoiceNumber: string;
  customerName: string | null;
  description: string;
  amount: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  paymentType: string;
  saleDate: Date;
  invoiceDueDate?: Date | null;
  accountNumber?: string | null;
  vatableIncome: boolean;
  serviceIncome: boolean;
  status: string;
  businessName?: string;
  businessAddress?: string;
}

export function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const layout = getPdfLayout(doc);
    const { left, contentWidth, rightEdge, amtColW, gap } = layout;
    const totalX = amountColumnX(layout, 0);
    const vatX = amountColumnX(layout, 1);
    const amountX = amountColumnX(layout, 2);
    const descW = Math.max(80, amountX - left - gap - 10);
    const descText = truncateText(data.description, 120);
    const rowH = Math.max(28, textHeight(doc, descText, descW, 8) + 14);
    const headerH = 22;

    doc
      .fontSize(22)
      .fillColor(PRIMARY_COLOR)
      .text("INVOICE", left, 50, { width: contentWidth });

    let y = doc.y + 12;
    doc.fontSize(8).fillColor("#6c757d");
    doc.text(`Invoice #${data.invoiceNumber}`, left, y, { width: contentWidth });
    y = doc.y + 2;
    doc.text(`Date: ${formatDate(data.saleDate)}`, left, y, { width: contentWidth });
    y = doc.y + 2;
    if (data.invoiceDueDate) {
      doc.text(`Due Date: ${formatDate(data.invoiceDueDate)}`, left, y, {
        width: contentWidth,
      });
      y = doc.y + 2;
    }
    doc.text(`Status: ${data.status}`, left, y, { width: contentWidth });
    y = doc.y + 14;

    doc.fillColor("#1a1a1a").fontSize(9);
    if (data.businessName) {
      doc.text("From:", left, y, { width: contentWidth });
      y = doc.y + 2;
      doc.fontSize(8).text(data.businessName, left, y, { width: contentWidth });
      if (data.businessAddress) {
        y = doc.y + 2;
        doc.text(data.businessAddress, left, y, { width: contentWidth });
      }
      if (data.accountNumber) {
        y = doc.y + 2;
        doc.text(`Account Number: ${data.accountNumber}`, left, y, {
          width: contentWidth,
        });
      }
      y = doc.y + 12;
      doc.fontSize(9);
    } else if (data.accountNumber) {
      doc.text(`Account Number: ${data.accountNumber}`, left, y, {
        width: contentWidth,
      });
      y = doc.y + 12;
    }

    doc.text("Bill To:", left, y, { width: contentWidth });
    y = doc.y + 2;
    doc.fontSize(8).text(data.customerName || "Customer", left, y, { width: contentWidth });
    y = doc.y + 18;

    const tableTop = y;
    doc.rect(left, tableTop, contentWidth, headerH).fillAndStroke("#f8f9fa", PRIMARY_COLOR);
    doc
      .fillColor("#1a1a1a")
      .fontSize(7)
      .font("Helvetica-Bold")
      .text("Description", left + 8, tableTop + 7, { width: descW })
      .text("Amount", amountX, tableTop + 7, { width: amtColW, align: "right" })
      .text("VAT", vatX, tableTop + 7, { width: amtColW, align: "right" })
      .text("Total", totalX, tableTop + 7, { width: amtColW, align: "right" })
      .font("Helvetica");

    const rowTop = tableTop + headerH;
    doc.rect(left, rowTop, contentWidth, rowH).stroke(PRIMARY_COLOR);
    doc
      .fillColor("#4a4a4a")
      .fontSize(8)
      .text(descText, left + 8, rowTop + 6, { width: descW });
    drawFittedCellText(doc, formatCurrency(data.amount), amountX, rowTop + 6, amtColW, {
      align: "right",
      fontSize: 8,
      color: "#4a4a4a",
    });
    drawFittedCellText(
      doc,
      truncateText(`${data.vatRate}% · ${formatCurrency(data.vatAmount)}`, 28),
      vatX,
      rowTop + 6,
      amtColW,
      { align: "right", fontSize: 8, color: "#4a4a4a" },
    );
    drawFittedCellText(
      doc,
      formatCurrency(data.totalAmount),
      totalX,
      rowTop + 6,
      amtColW,
      { align: "right", fontSize: 8, color: "#4a4a4a" },
    );

    y = rowTop + rowH + 16;
    const totalBoxH = 44;
    const totalBoxW = Math.min(contentWidth, 280);
    doc.rect(left, y, totalBoxW, totalBoxH).fillAndStroke("#e6f7f7", PRIMARY_COLOR);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#004d4d")
      .text("Total Amount", left + 12, y + 10, { width: totalBoxW - 24 });
    drawFittedCellText(
      doc,
      formatCurrency(data.totalAmount),
      left + 12,
      y + 26,
      totalBoxW - 24,
      { fontSize: 10, font: "Helvetica-Bold", color: "#004d4d" },
    );
    doc.font("Helvetica").fillColor("#1a1a1a");

    y += totalBoxH + 12;
    doc.fontSize(7).fillColor("#6c757d");
    doc.text(`Payment: ${data.paymentType}`, left, y, { width: contentWidth });
    y = doc.y + 2;
    doc.text(
      data.vatableIncome ? "Vatable income: Yes" : "Vatable income: No",
      left,
      y,
      { width: contentWidth },
    );
    y = doc.y + 2;
    doc.text(
      data.serviceIncome ? "Service income: Yes" : "Service income: No",
      left,
      y,
      { width: contentWidth },
    );
    y = doc.y + 20;
    doc.text("Thank you for your business.", left, y, { width: contentWidth });
    doc.text(`Generated by Fileam · ${DOMAIN}`, left, doc.y + 2, {
      width: contentWidth,
    });

    doc.end();
  });
}

export interface ReceiptData {
  expenseNumber: string;
  description: string;
  category: string;
  amount: number;
  vatInclusive: boolean;
  vatAmount: number | null;
  totalAmount: number;
  expenseDate: Date;
  businessName?: string;
}

export function generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const layout = getPdfLayout(doc);
    const { left, contentWidth } = layout;

    doc.fontSize(22).fillColor(PRIMARY_COLOR).text("RECEIPT", left, 50, {
      width: contentWidth,
    });

    let y = doc.y + 12;
    doc.fontSize(8).fillColor("#6c757d");
    doc.text(`Receipt #${data.expenseNumber}`, left, y, { width: contentWidth });
    y = doc.y + 2;
    doc.text(`Date: ${formatDate(data.expenseDate)}`, left, y, { width: contentWidth });
    y = doc.y + 2;
    doc.text(`Category: ${truncateText(data.category, 60)}`, left, y, {
      width: contentWidth,
    });
    y = doc.y + 14;

    if (data.businessName) {
      doc.fillColor("#1a1a1a").fontSize(9).text("From:", left, y, { width: contentWidth });
      y = doc.y + 2;
      doc.fontSize(8).text(data.businessName, left, y, { width: contentWidth });
      y = doc.y + 14;
    }

    doc.fontSize(10).fillColor("#1a1a1a").text("Description", left, y, {
      width: contentWidth,
    });
    y = doc.y + 4;
    doc
      .fontSize(9)
      .fillColor("#4a4a4a")
      .text(truncateText(data.description, 200), left, y, { width: contentWidth });
    y = doc.y + 16;

    y = drawKeyValueBox(doc, layout, y, [
      { label: "Amount", value: formatCurrency(data.amount) },
      {
        label: "VAT",
        value: data.vatInclusive
          ? `Inclusive (${formatCurrency(data.vatAmount ?? 0)})`
          : "Exclusive",
      },
      { label: "Total", value: formatCurrency(data.totalAmount) },
    ]);

    y += 20;
    doc
      .fontSize(7)
      .fillColor("#6c757d")
      .text(
        "This is an official receipt for the transaction listed above.",
        left,
        y,
        { width: contentWidth },
      );
    doc.text(`Generated by Fileam · ${DOMAIN}`, left, doc.y + 2, {
      width: contentWidth,
    });

    doc.end();
  });
}

export interface TaxFilingData {
  taxType: string;
  periodYear: number;
  periodMonth: number;
  amountDue: number;
  penalties: number;
  totalPayable: number;
  filingDueDate: Date;
  status: string;
  currency: string;
  submittedAt: Date | null;
  stateOfOperation?: string | null;
  vatRegistrationNumber?: string | null;
}

export function generateTaxFilingPdf(data: TaxFilingData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const layout = getPdfLayout(doc);
    const { left, contentWidth } = layout;
    const periodLabel = `${new Date(data.periodYear, data.periodMonth - 1).toLocaleString("default", { month: "long" })} ${data.periodYear}`;

    doc
      .fontSize(20)
      .fillColor(PRIMARY_COLOR)
      .text(`${truncateText(data.taxType, 40)} FILING`, left, 50, {
        width: contentWidth,
      });

    let y = doc.y + 12;
    doc.fontSize(8).fillColor("#6c757d");
    doc.text(`Period: ${periodLabel}`, left, y, { width: contentWidth });
    y = doc.y + 2;
    doc.text(`Due date: ${formatDate(data.filingDueDate)}`, left, y, {
      width: contentWidth,
    });
    y = doc.y + 2;
    doc.text(`Status: ${data.status}`, left, y, { width: contentWidth });
    if (data.vatRegistrationNumber) {
      y = doc.y + 2;
      doc.text(`VAT reg: ${data.vatRegistrationNumber}`, left, y, {
        width: contentWidth,
      });
    }
    if (data.stateOfOperation) {
      y = doc.y + 2;
      doc.text(`State: ${data.stateOfOperation}`, left, y, { width: contentWidth });
    }
    y = doc.y + 16;

    y = drawKeyValueBox(doc, layout, y, [
      { label: "Amount due", value: formatCurrency(data.amountDue, data.currency) },
      { label: "Penalties", value: formatCurrency(data.penalties, data.currency) },
      {
        label: "Total payable",
        value: formatCurrency(data.totalPayable, data.currency),
      },
    ]);

    if (data.submittedAt) {
      y += 12;
      doc
        .fontSize(7)
        .fillColor("#6c757d")
        .text(`Submitted: ${formatDate(data.submittedAt)}`, left, y, {
          width: contentWidth,
        });
    }

    y = doc.y + 20;
    doc
      .fontSize(7)
      .fillColor("#6c757d")
      .text("Official tax filing document.", left, y, { width: contentWidth });
    doc.text(`Generated by Fileam · ${DOMAIN}`, left, doc.y + 2, {
      width: contentWidth,
    });

    doc.end();
  });
}

export interface ReportData {
  reportType: string;
  periodLabel: string;
  periodYear: number;
  periodMonth: number;
  generatedAt: Date;
  format: string;
  status: string;
}

export interface FullReportData extends ReportData {
  businessName?: string;
  businessAddress?: string;
  vatSummary: {
    outputVat: number;
    inputVatClaimable: number;
    netVatPayable: number;
    belowThreshold: boolean;
    vatThreshold: number;
    percentOfThreshold: number;
  };
  whtSummary: {
    serviceIncome: number;
    whtRate: number;
    estimatedWhtDeducted: number;
  };
  citSummary: {
    monthlyProfit: number;
    annualizedProfit: number;
    citRate: number;
    estimatedAnnualCit: number;
    capitalAllowances?: number;
    lossCarryForward?: number;
  };
  filings: Array<{
    taxType: string;
    periodLabel: string;
    amountDue: number;
    penalties: number;
    totalPayable: number;
    status: string;
    filingDueDate: Date;
  }>;
  sales: Array<{
    invoiceNumber: string;
    customerName: string | null;
    description: string;
    amount: number;
    vatAmount: number;
    totalAmount: number;
    saleDate: Date;
    status: string;
  }>;
  expenses: Array<{
    expenseNumber: string;
    description: string;
    category: string;
    amount: number;
    vatAmount: number;
    totalAmount: number;
    expenseDate: Date;
  }>;
  compliance: {
    totalFilings: number;
    submittedCount: number;
    pendingCount: number;
    overdueCount: number;
  };
}

/** Full report PDF with VAT summary, financial records, logo, and professional design. */
export function generateFullReportPdf(
  data: FullReportData,
  logoBuffer: Buffer | null,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const layout = getPdfLayout(doc);
    const { left, contentWidth, amtColW } = layout;
    let y = 50;

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, left, y, { width: 120, height: 40 });
      } catch {
        /* ignore */
      }
      y += 50;
    } else {
      doc.fontSize(20).fillColor(PRIMARY_COLOR).text("FILEAM", left, y);
      y += 35;
    }

    doc
      .fontSize(18)
      .fillColor(PRIMARY_COLOR)
      .text("Summary Tax Report", left, y, { width: contentWidth });
    y = doc.y + 20;

    doc.fontSize(7).fillColor("#6c757d");
    doc.text(`Period: ${data.periodLabel}`, left, y, { width: contentWidth });
    y = doc.y + 2;
    doc.text(`Generated: ${formatDate(data.generatedAt)}`, left, y, {
      width: contentWidth,
    });
    if (data.businessName) {
      y = doc.y + 2;
      doc.text(`Business: ${truncateText(data.businessName, 80)}`, left, y, {
        width: contentWidth,
      });
    }
    y = doc.y + 2;
    doc.text(
      `Format: ${data.format} | Status: ${data.status} | Currency: NGN`,
      left,
      y,
      { width: contentWidth },
    );
    y = doc.y + 16;

    const drawSection = (title: string, content: () => void) => {
      y = ensurePageSpace(doc, y, 40);
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(PRIMARY_COLOR)
        .text(title, left, y, { width: contentWidth });
      y = doc.y + 10;
      doc.font("Helvetica").fillColor("#1a1a1a");
      content();
      y += 12;
    };

    const isAmountColumn = (key: string) =>
      key === "Amount" ||
      key === "VAT" ||
      key === "Total" ||
      key === "Amount Due";

    const drawTableHeader = (tableTop: number, cols: ReturnType<typeof tableColumns>) => {
      const headerH = 20;
      doc.rect(left, tableTop, contentWidth, headerH).fillAndStroke("#e6f7f7", PRIMARY_COLOR);
      doc.fontSize(6).font("Helvetica-Bold").fillColor("#004d4d");
      for (const [key, col] of Object.entries(cols)) {
        drawFittedCellText(doc, key, col.x, tableTop + 6, col.w, {
          align: isAmountColumn(key) ? "right" : "left",
          fontSize: 6,
          font: "Helvetica-Bold",
          color: "#004d4d",
        });
      }
      doc.font("Helvetica").fillColor("#4a4a4a");
      return headerH;
    };

    const drawDataTable = (
      cols: ReturnType<typeof tableColumns>,
      rows: Record<string, string>[],
      rowH = 17,
    ) => {
      const headerH = 20;
      let tableTop = ensurePageSpace(doc, y, headerH + rowH);
      const headerHActual = drawTableHeader(tableTop, cols);
      let rowY = tableTop + headerHActual;
      for (const row of rows) {
        const prevY = rowY;
        rowY = ensurePageSpace(doc, rowY, rowH);
        if (rowY < prevY) {
          tableTop = rowY;
          const h = drawTableHeader(tableTop, cols);
          rowY = tableTop + h;
        }
        doc.rect(left, rowY, contentWidth, rowH).stroke("#e9ecef");
        for (const [key, col] of Object.entries(cols)) {
          drawFittedCellText(doc, row[key] ?? "—", col.x, rowY + 4, col.w, {
            align: isAmountColumn(key) ? "right" : "left",
            fontSize: 7,
            color: "#4a4a4a",
          });
        }
        rowY += rowH;
      }
      y = rowY + 8;
    };

    drawSection("1. VAT RETURN SUMMARY", () => {
      y = drawKeyValueBox(doc, layout, y, [
        { label: "Output VAT (Sales)", value: formatNaira(data.vatSummary.outputVat) },
        { label: "Input VAT (Purchases)", value: formatNaira(data.vatSummary.inputVatClaimable) },
        { label: "Net VAT Payable", value: formatNaira(data.vatSummary.netVatPayable) },
      ]);
      y += 4;
      doc
        .fontSize(7)
        .fillColor("#4a4a4a")
        .text(
          `Threshold: ${formatNaira(data.vatSummary.vatThreshold)} · ${data.vatSummary.percentOfThreshold.toFixed(1)}%`,
          left,
          y,
          { width: contentWidth },
        );
      y = doc.y + 2;
      doc.text(
        data.vatSummary.belowThreshold
          ? "Below VAT registration threshold"
          : "Above VAT threshold",
        left,
        y,
        { width: contentWidth },
      );
      y = doc.y;
    });

    drawSection("2. WHT SCHEDULE", () => {
      y = drawKeyValueBox(doc, layout, y, [
        { label: "Service Income", value: formatNaira(data.whtSummary.serviceIncome) },
        { label: "WHT Rate", value: `${data.whtSummary.whtRate}%` },
        {
          label: "Estimated WHT Deducted",
          value: formatNaira(data.whtSummary.estimatedWhtDeducted),
        },
      ]);
    });

    drawSection("3. CIT SUMMARY", () => {
      y = drawKeyValueBox(doc, layout, y, [
        { label: "Monthly Profit", value: formatNaira(data.citSummary.monthlyProfit) },
        { label: "Annualized Profit", value: formatNaira(data.citSummary.annualizedProfit) },
        { label: "CIT Rate", value: `${data.citSummary.citRate}%` },
        {
          label: "Estimated Annual CIT",
          value: formatNaira(data.citSummary.estimatedAnnualCit),
        },
      ]);
    });

    drawSection("4. FILING HISTORY", () => {
      if (data.filings.length === 0) {
        doc.fontSize(7).fillColor("#6c757d").text("No filings for this period.", left, y, {
          width: contentWidth,
        });
        y = doc.y;
      } else {
        const cols = tableColumns(layout, 8, [
          { key: "Tax Type", width: 52 },
          { key: "Period", width: 68 },
          { key: "Status", width: 58 },
          { key: "Amount Due", width: amtColW, fromRight: true },
          { key: "Total", width: amtColW, fromRight: true },
        ]);
        drawDataTable(
          cols,
          data.filings.map((f) => ({
            "Tax Type": truncateText(f.taxType, 14),
            Period: truncateText(f.periodLabel, 16),
            Status: truncateText(f.status, 12),
            "Amount Due": formatTableAmount(f.amountDue),
            Total: formatTableAmount(f.totalPayable),
          })),
        );
      }
    });

    drawSection("5. SALES / INVOICES", () => {
      if (data.sales.length === 0) {
        doc.fontSize(7).fillColor("#6c757d").text("No sales for this period.", left, y, {
          width: contentWidth,
        });
        y = doc.y;
      } else {
        const cols = tableColumns(layout, 8, [
          { key: "Invoice", width: 62 },
          { key: "Customer", width: 80 },
          { key: "Amount", width: amtColW, fromRight: true },
          { key: "VAT", width: amtColW, fromRight: true },
          { key: "Total", width: amtColW, fromRight: true },
        ]);
        drawDataTable(
          cols,
          data.sales.map((s) => ({
            Invoice: truncateText(s.invoiceNumber, 16),
            Customer: truncateText(s.customerName || "—", 28),
            Amount: formatTableAmount(s.amount),
            VAT: formatTableAmount(s.vatAmount),
            Total: formatTableAmount(s.totalAmount),
          })),
        );
      }
    });

    drawSection("6. EXPENSES", () => {
      if (data.expenses.length === 0) {
        doc.fontSize(7).fillColor("#6c757d").text("No expenses for this period.", left, y, {
          width: contentWidth,
        });
        y = doc.y;
      } else {
        const cols = tableColumns(layout, 8, [
          { key: "Receipt #", width: 62 },
          { key: "Category", width: 80 },
          { key: "Amount", width: amtColW, fromRight: true },
          { key: "VAT", width: amtColW, fromRight: true },
          { key: "Total", width: amtColW, fromRight: true },
        ]);
        drawDataTable(
          cols,
          data.expenses.map((e) => ({
            "Receipt #": truncateText(e.expenseNumber, 16),
            Category: truncateText(e.category, 28),
            Amount: formatTableAmount(e.amount),
            VAT: formatTableAmount(e.vatAmount),
            Total: formatTableAmount(e.totalAmount),
          })),
        );
      }
    });

    drawSection("7. COMPLIANCE SUMMARY", () => {
      y = drawKeyValueBox(doc, layout, y, [
        { label: "Total Filings", value: String(data.compliance.totalFilings) },
        { label: "Submitted/Paid", value: String(data.compliance.submittedCount) },
        { label: "Pending", value: String(data.compliance.pendingCount) },
        { label: "Overdue", value: String(data.compliance.overdueCount) },
      ]);
    });

    y = ensurePageSpace(doc, y, 40);
    doc
      .fontSize(7)
      .fillColor("#6c757d")
      .text(
        "Official report document. This report covers VAT records, financial transactions, and filing status for the stated period.",
        left,
        y,
        { width: contentWidth },
      );
    doc.text(`Generated by Fileam · ${DOMAIN}`, left, doc.y + 2, {
      width: contentWidth,
    });

    doc.end();
  });
}
