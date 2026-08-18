import { Decimal } from "@prisma/client/runtime/library";
import { coerceInvoiceAmountPaid } from "../constants/invoiceAmountPaid";
import {
  isSalePaidStatus,
  resolveSaleInvoiceStatus,
  SALE_STATUS,
} from "../constants/salePaymentRules";
import { normalizeMoneyAmount } from "./monetaryAmount";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  return Number(v);
}

export type StatusBucket = { count: number; amount: number };

export type ReceivableSummary = {
  totalSalesAmount: number;
  paid: StatusBucket;
  inProgress: StatusBucket;
  pending: StatusBucket;
  partial: StatusBucket;
  overdue: StatusBucket;
  outstandingReceivable: number;
};

export type PayableSummary = {
  totalPurchaseAmount: number;
  paid: StatusBucket;
  inProgress: StatusBucket;
  pending: StatusBucket;
  partial: StatusBucket;
  overdue: StatusBucket;
  outstandingPayable: number;
};

function emptyBucket(): StatusBucket {
  return { count: 0, amount: 0 };
}

function addBucket(bucket: StatusBucket, amount: number): void {
  bucket.count += 1;
  bucket.amount = normalizeMoneyAmount(bucket.amount + amount);
}

export function summarizeSalesForReceivable(
  sales: Array<{
    totalAmount: Decimal | number;
    status: string;
    paymentType: string;
    invoiceAmountPaid?: unknown;
    invoiceDueDate?: Date | null;
  }>,
): ReceivableSummary {
  const summary: ReceivableSummary = {
    totalSalesAmount: 0,
    paid: emptyBucket(),
    inProgress: emptyBucket(),
    pending: emptyBucket(),
    partial: emptyBucket(),
    overdue: emptyBucket(),
    outstandingReceivable: 0,
  };

  for (const sale of sales) {
    const total = d(sale.totalAmount);
    summary.totalSalesAmount = normalizeMoneyAmount(
      summary.totalSalesAmount + total,
    );
    const resolved = resolveSaleInvoiceStatus(sale);
    const paidAmt = coerceInvoiceAmountPaid(sale.invoiceAmountPaid).total;
    const outstanding = normalizeMoneyAmount(Math.max(0, total - paidAmt));

    if (isSalePaidStatus(resolved) || resolved === SALE_STATUS.CANCELLED) {
      addBucket(summary.paid, total);
      continue;
    }
    if (resolved === SALE_STATUS.IN_PROGRESS) {
      addBucket(summary.inProgress, total);
      summary.outstandingReceivable = normalizeMoneyAmount(
        summary.outstandingReceivable + total,
      );
      continue;
    }
    if (resolved === SALE_STATUS.OVERDUE) {
      addBucket(summary.overdue, outstanding || total);
      summary.outstandingReceivable = normalizeMoneyAmount(
        summary.outstandingReceivable + (outstanding || total),
      );
      continue;
    }
    if (resolved === SALE_STATUS.PARTIAL) {
      addBucket(summary.partial, outstanding || total);
      summary.outstandingReceivable = normalizeMoneyAmount(
        summary.outstandingReceivable + (outstanding || total),
      );
      continue;
    }
    addBucket(summary.pending, outstanding || total);
    summary.outstandingReceivable = normalizeMoneyAmount(
      summary.outstandingReceivable + (outstanding || total),
    );
  }

  return summary;
}

export function summarizeExpensesForPayable(
  expenses: Array<{
    totalAmount: Decimal | number;
    status: string;
    paymentType: string;
    invoiceAmountPaid?: unknown;
    invoiceDueDate?: Date | null;
  }>,
): PayableSummary {
  const summary: PayableSummary = {
    totalPurchaseAmount: 0,
    paid: emptyBucket(),
    inProgress: emptyBucket(),
    pending: emptyBucket(),
    partial: emptyBucket(),
    overdue: emptyBucket(),
    outstandingPayable: 0,
  };

  for (const expense of expenses) {
    const total = d(expense.totalAmount);
    summary.totalPurchaseAmount = normalizeMoneyAmount(
      summary.totalPurchaseAmount + total,
    );
    const resolved = resolveSaleInvoiceStatus(expense);
    const paidAmt = coerceInvoiceAmountPaid(expense.invoiceAmountPaid).total;
    const outstanding = normalizeMoneyAmount(Math.max(0, total - paidAmt));

    if (isSalePaidStatus(resolved) || resolved === SALE_STATUS.CANCELLED) {
      addBucket(summary.paid, total);
      continue;
    }
    if (resolved === SALE_STATUS.IN_PROGRESS) {
      addBucket(summary.inProgress, total);
      summary.outstandingPayable = normalizeMoneyAmount(
        summary.outstandingPayable + total,
      );
      continue;
    }
    if (resolved === SALE_STATUS.OVERDUE) {
      addBucket(summary.overdue, outstanding || total);
      summary.outstandingPayable = normalizeMoneyAmount(
        summary.outstandingPayable + (outstanding || total),
      );
      continue;
    }
    if (resolved === SALE_STATUS.PARTIAL) {
      addBucket(summary.partial, outstanding || total);
      summary.outstandingPayable = normalizeMoneyAmount(
        summary.outstandingPayable + (outstanding || total),
      );
      continue;
    }
    addBucket(summary.pending, outstanding || total);
    summary.outstandingPayable = normalizeMoneyAmount(
      summary.outstandingPayable + (outstanding || total),
    );
  }

  return summary;
}

export function formatYmd(date: Date | null | undefined): string | null {
  if (!date) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
