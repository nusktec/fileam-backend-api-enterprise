/**
 * Report Data Service - Aggregates VAT records, financial data, and filings for reports.
 */
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { taxComputationService } from "./taxComputationService";

const FILEAM_LOGO_URL =
  "https://usc1.contabostorage.com/385b0054b385440e928060e34f0e5b18:fileam-assets/fileam-logo.png";

function toNum(d: Decimal | number | null | undefined): number {
  if (d == null) return 0;
  return typeof d === "number" ? d : Number(d);
}

export interface ReportDataPayload {
  reportType: string;
  periodLabel: string;
  periodYear: number;
  periodMonth: number;
  generatedAt: Date;
  format: string;
  status: string;
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

export async function getReportDataForPeriod(
  userId: string,
  year: number,
  month: number,
): Promise<Omit<ReportDataPayload, "reportType" | "periodLabel" | "generatedAt" | "format" | "status">> {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const periodLabel = `${new Date(year, month - 1).toLocaleString("default", { month: "long" })} ${year}`;

  const [sales, expenses, payables, computation, business, user] =
    await Promise.all([
      prisma.sale.findMany({
        where: { userId, saleDate: { gte: start, lte: end } },
        orderBy: { saleDate: "asc" },
      }),
      prisma.expense.findMany({
        where: { userId, expenseDate: { gte: start, lte: end } },
        orderBy: { expenseDate: "asc" },
      }),
      prisma.taxPayable.findMany({
        where: {
          userId,
          periodYear: year,
          periodMonth: month,
        },
        orderBy: { taxType: "asc" },
      }),
      taxComputationService.getForPeriod(userId, year, month),
      prisma.business.findFirst({
        where: { userId },
        select: { name: true, streetAddress: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { organizationName: true, organizationAddress: true },
      }),
    ]);

  const compliance = {
    totalFilings: payables.length,
    submittedCount: payables.filter((p) =>
      ["submitted", "paid", "overpaid"].includes(p.status),
    ).length,
    pendingCount: payables.filter((p) => p.status === "pending").length,
    overdueCount: payables.filter((p) => p.status === "overdue").length,
  };

  return {
    periodYear: year,
    periodMonth: month,
    businessName: business?.name ?? user?.organizationName ?? undefined,
    businessAddress:
      business?.streetAddress ?? user?.organizationAddress ?? undefined,
    vatSummary: {
      outputVat: computation.vat.outputVat,
      inputVatClaimable: computation.vat.inputVatClaimable,
      netVatPayable: computation.vat.netVatPayable,
      belowThreshold: computation.vat.belowThreshold,
      vatThreshold: computation.vat.vatThreshold,
      percentOfThreshold: computation.vat.percentOfThreshold,
    },
    whtSummary: {
      serviceIncome: computation.wht.serviceIncome,
      whtRate: computation.wht.whtRateServices,
      estimatedWhtDeducted: computation.wht.estimatedWhtDeducted,
    },
    citSummary: {
      monthlyProfit: computation.cit.monthlyProfit,
      annualizedProfit: computation.cit.annualizedProfit,
      citRate: computation.cit.citRate,
      estimatedAnnualCit: computation.cit.estimatedAnnualCit,
    },
    filings: payables.map((p) => ({
      taxType: p.taxType,
      periodLabel: `${new Date(p.periodYear, p.periodMonth - 1).toLocaleString("default", { month: "short" })} ${p.periodYear}`,
      amountDue: toNum(p.amountDue),
      penalties: toNum(p.penalties),
      totalPayable: toNum(p.totalPayable),
      status: p.status,
      filingDueDate: p.filingDueDate,
    })),
    sales: sales.map((s) => ({
      invoiceNumber: s.invoiceNumber,
      customerName: s.customerName,
      description: s.description,
      amount: toNum(s.amount),
      vatAmount: toNum(s.vatAmount),
      totalAmount: toNum(s.totalAmount),
      saleDate: s.saleDate,
      status: s.status,
    })),
    expenses: expenses.map((e) => ({
      expenseNumber: e.expenseNumber,
      description: e.description,
      category: e.category,
      amount: toNum(e.amount),
      vatAmount: toNum(e.vatAmount),
      totalAmount: toNum(e.totalAmount),
      expenseDate: e.expenseDate,
    })),
    compliance,
  };
}

export async function fetchLogoBuffer(): Promise<Buffer | null> {
  try {
    const res = await fetch(FILEAM_LOGO_URL);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}
