/**
 * Evidence Vault PDF Service - Auto-generates professional PDFs for transactions
 * and stores them in S3. Uses the email design pattern from pdfTemplates.
 */
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  generateInvoicePdf,
  generateTaxFilingPdf,
  generateReportPdf,
} from "../../services/template/pdfTemplates";
import { uploadToS3 } from "../../services/mediaUploadService";
import { MEDIA_CONFIG } from "../../config/s3";

function toNum(d: Decimal | number | null | undefined): number {
  if (d == null) return 0;
  return typeof d === "number" ? d : Number(d);
}

const EVIDENCE_FOLDER = MEDIA_CONFIG.UPLOAD_FOLDERS.EVIDENCE_VAULT;

export async function generateAndStorePdfForDocument(
  userId: string,
  compositeId: string,
): Promise<string | null> {
  const entityId = compositeId.replace(/^(sale|expense|payable|payable-receipt|report)-/, "");
  const prefix = compositeId.startsWith("sale-")
    ? "sale"
    : compositeId.startsWith("payable-") && !compositeId.startsWith("payable-receipt-")
      ? "payable"
      : compositeId.startsWith("report-")
        ? "report"
        : null;

  if (!entityId) return null;

  let buffer: Buffer;
  let filename: string;

  if (prefix === "sale") {
    const sale = await prisma.sale.findFirst({
      where: { id: entityId, userId },
    });
    if (!sale) return null;

    const [user, business] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { organizationName: true, organizationAddress: true },
      }),
      prisma.business.findFirst({
        where: { userId },
        select: { name: true, streetAddress: true },
      }),
    ]);

    buffer = await generateInvoicePdf({
      invoiceNumber: sale.invoiceNumber,
      customerName: sale.customerName,
      description: sale.description,
      amount: toNum(sale.amount),
      vatRate: toNum(sale.vatRate),
      vatAmount: toNum(sale.vatAmount),
      totalAmount: toNum(sale.totalAmount),
      paymentType: sale.paymentType,
      saleDate: sale.saleDate,
      vatableIncome: sale.vatableIncome,
      serviceIncome: sale.serviceIncome,
      status: sale.status,
      businessName: business?.name ?? user?.organizationName ?? undefined,
      businessAddress: business?.streetAddress ?? user?.organizationAddress ?? undefined,
    });
    filename = `invoice-${sale.invoiceNumber}.pdf`;
  } else if (prefix === "payable") {
    const payable = await prisma.taxPayable.findFirst({
      where: { id: entityId, userId },
    });
    if (!payable) return null;

    const periodLabel = `${new Date(payable.periodYear, payable.periodMonth - 1).toLocaleString("default", { month: "short" })} ${payable.periodYear}`;

    buffer = await generateTaxFilingPdf({
      taxType: payable.taxType,
      periodYear: payable.periodYear,
      periodMonth: payable.periodMonth,
      amountDue: toNum(payable.amountDue),
      penalties: toNum(payable.penalties),
      totalPayable: toNum(payable.totalPayable),
      filingDueDate: payable.filingDueDate,
      status: payable.status,
      currency: payable.currency,
      submittedAt: payable.submittedAt,
      stateOfOperation: payable.stateOfOperation,
      vatRegistrationNumber: payable.vatRegistrationNumber,
    });
    filename = `${payable.taxType}-filing-${periodLabel.replace(/\s/g, "-")}.pdf`;
  } else if (prefix === "report") {
    const report = await prisma.report.findFirst({
      where: { id: entityId, userId },
    });
    if (!report) return null;

    buffer = await generateReportPdf({
      reportType: report.reportType,
      periodLabel: report.periodLabel,
      periodYear: report.periodYear,
      periodMonth: report.periodMonth,
      generatedAt: report.generatedAt,
      format: report.format,
      status: report.status,
    });
    filename = `report-${report.reportType}-${report.periodLabel.replace(/\s/g, "-")}.pdf`;
  } else {
    return null;
  }

  const result = await uploadToS3({
    buffer,
    mimetype: "application/pdf",
    originalName: filename,
    folder: EVIDENCE_FOLDER,
  });

  if (!result) return null;

  if (prefix === "sale") {
    await prisma.sale.update({
      where: { id: entityId },
      data: { documentUrl: result.url },
    });
  } else if (prefix === "payable") {
    await prisma.taxPayable.update({
      where: { id: entityId },
      data: { documentUrl: result.url },
    });
  } else if (prefix === "report") {
    await prisma.report.update({
      where: { id: entityId },
      data: { documentUrl: result.url },
    });
  }

  return result.url;
}
