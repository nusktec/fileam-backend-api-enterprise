/**
 * Evidence Vault PDF Service - Generates PDFs on request (no storage).
 * Uses the email design pattern from pdfTemplates.
 */
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  generateInvoicePdf,
  generateReceiptPdf,
  generateTaxFilingPdf,
  generateFullReportPdf,
} from "../../services/template/pdfTemplates";
import { coerceInvoiceAmountPaid } from "../../constants/invoiceAmountPaid";
import { resolveSaleInvoiceStatus } from "../../constants/salePaymentRules";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import {
  getReportDataForPeriod,
  fetchLogoBuffer,
} from "./reportDataService";

function toNum(d: Decimal | number | null | undefined): number {
  if (d == null) return 0;
  return typeof d === "number" ? d : Number(d);
}

export async function generatePdfForDocument(
  userId: string,
  compositeId: string,
): Promise<{ buffer: Buffer; filename: string } | null> {
  if (compositeId.startsWith("sale-receipt-")) return null;
  const entityId = compositeId.replace(/^(sale|expense|payable|payable-receipt|report)-/, "");
  const prefix = compositeId.startsWith("sale-")
    ? "sale"
    : compositeId.startsWith("expense-")
      ? "expense"
      : compositeId.startsWith("payable-") && !compositeId.startsWith("payable-receipt-")
        ? "payable"
        : compositeId.startsWith("report-")
          ? "report"
          : null;

  if (!prefix || !entityId) return null;

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
        select: { name: true, streetAddress: true, bankAccount: true },
      }),
    ]);

    const totalAmount = toNum(sale.totalAmount);
    const amountPaid = normalizeMoneyAmount(
      coerceInvoiceAmountPaid(sale.invoiceAmountPaid).total,
    );
    const outstandingBalance = normalizeMoneyAmount(
      Math.max(0, totalAmount - amountPaid),
    );
    const status = resolveSaleInvoiceStatus({
      paymentType: sale.paymentType,
      status: sale.status,
      invoiceAmountPaid: coerceInvoiceAmountPaid(sale.invoiceAmountPaid),
      totalAmount,
      invoiceDueDate: sale.invoiceDueDate,
    });

    buffer = await generateInvoicePdf({
      invoiceNumber: sale.invoiceNumber,
      customerName: sale.customerName,
      description: sale.description,
      amount: toNum(sale.amount),
      vatRate: toNum(sale.vatRate),
      vatAmount: toNum(sale.vatAmount),
      totalAmount,
      amountPaid,
      outstandingBalance,
      paymentType: sale.paymentType,
      saleDate: sale.saleDate,
      invoiceDueDate: sale.invoiceDueDate,
      accountNumber: business?.bankAccount ?? null,
      vatableIncome: sale.vatableIncome,
      serviceIncome: sale.serviceIncome,
      status,
      businessName: business?.name ?? user?.organizationName ?? undefined,
      businessAddress: business?.streetAddress ?? user?.organizationAddress ?? undefined,
    });
    filename = `invoice-${sale.invoiceNumber}.pdf`;
  } else if (prefix === "expense") {
    const expense = await prisma.expense.findFirst({
      where: { id: entityId, userId },
    });
    if (!expense) return null;

    const business = await prisma.business.findFirst({
      where: { userId },
      select: { name: true },
    });

    buffer = await generateReceiptPdf({
      expenseNumber: expense.expenseNumber,
      description: expense.description,
      category: expense.category,
      amount: toNum(expense.amount),
      vatInclusive: expense.vatInclusive,
      vatAmount: expense.vatAmount != null ? toNum(expense.vatAmount) : null,
      totalAmount: toNum(expense.totalAmount),
      expenseDate: expense.expenseDate,
      businessName: business?.name ?? undefined,
    });
    filename = `receipt-${expense.expenseNumber}.pdf`;
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

    const [periodData, logoBuffer] = await Promise.all([
      getReportDataForPeriod(userId, report.periodYear, report.periodMonth),
      fetchLogoBuffer(),
    ]);

    const { periodYear, periodMonth, ...rest } = periodData;
    const fullReportData = {
      reportType: report.reportType,
      periodLabel: report.periodLabel,
      periodYear: report.periodYear,
      periodMonth: report.periodMonth,
      generatedAt: report.generatedAt,
      format: report.format,
      status: report.status,
      ...rest,
    };

    buffer = await generateFullReportPdf(fullReportData, logoBuffer);
    filename = `report-${report.reportType}-${report.periodLabel.replace(/\s/g, "-")}.pdf`;
  } else {
    return null;
  }

  return { buffer, filename };
}
