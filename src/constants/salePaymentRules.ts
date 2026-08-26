import { computeInvoicePaymentStatus } from "./invoicePaymentStatus";
import {
  coerceInvoiceAmountPaid,
  type InvoiceAmountPaid,
} from "./invoiceAmountPaid";

/** Matches mobile validation `paymentType` values. */
export const PAYMENT_TYPE_CASH = "Cash";
export const PAYMENT_TYPE_CARD = "Card";
export const PAYMENT_TYPE_TRANSFER = "Transfer";
export const PAYMENT_TYPE_INVOICE = "Invoice";

/**
 * Sale / expense payment lifecycle.
 * - Cash / Transfer → PAID on create (Cash → cash ledger, Transfer → bank ledger).
 * - Card → IN_PROGRESS on create, confirmed to PAID via PATCH .../payment-status.
 * - Invoice → Pending / Partial / PAID / Overdue, always calculated from
 *   invoiceAmountPaid.total, totalAmount and invoiceDueDate.
 * - CANCELLED is manual and never recalculated.
 */
export const SALE_STATUS = {
  IN_PROGRESS: "IN_PROGRESS",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
  PENDING: "Pending",
  OVERDUE: "Overdue",
  PARTIAL: "Partial",
} as const;

export type SaleStatusValue = (typeof SALE_STATUS)[keyof typeof SALE_STATUS];

export function isInvoicePaymentType(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPE_INVOICE;
}

export function isCashPaymentType(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPE_CASH;
}

export function isTransferPaymentType(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPE_TRANSFER;
}

/** Card or bank transfer — Card awaits confirmation; Transfer is bank-settled on create. */
export function isAsyncPaymentType(paymentType: string): boolean {
  return (
    paymentType === PAYMENT_TYPE_CARD || paymentType === PAYMENT_TYPE_TRANSFER
  );
}

/** Card only — Transfer is treated as PAID / bank-settled when recorded. */
export function isPendingAsyncPaymentType(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPE_CARD;
}

/**
 * Initial stored status on create:
 * - Invoice → calculated from invoiceAmountPaid.total / totalAmount / invoiceDueDate
 * - Cash / Transfer (or `fullyPaid`, e.g. bulk) → PAID
 * - Card → IN_PROGRESS until PATCH .../payment-status
 */
export function initialSaleStatusForPaymentType(
  paymentType: string,
  opts?: {
    invoiceAmountPaid?: InvoiceAmountPaid | number;
    totalAmount?: number;
    invoiceDueDate?: Date | null;
    fullyPaid?: boolean;
  },
): string {
  if (isInvoicePaymentType(paymentType)) {
    const paid = coerceInvoiceAmountPaid(opts?.invoiceAmountPaid ?? 0);
    return computeInvoicePaymentStatus({
      invoicePaidAmount: paid.total,
      amount: opts?.totalAmount ?? 0,
      invoiceDueDate: opts?.invoiceDueDate,
    });
  }
  if (opts?.fullyPaid) return SALE_STATUS.PAID;
  if (isCashPaymentType(paymentType)) return SALE_STATUS.PAID;
  if (isTransferPaymentType(paymentType)) return SALE_STATUS.PAID;
  return SALE_STATUS.IN_PROGRESS;
}

/** True if status means money fully collected ("Paid" kept for legacy rows). */
export function isSalePaidStatus(status: string): boolean {
  return status === SALE_STATUS.PAID || status === "Paid";
}

/** Unpaid / partially paid receivables. */
export function isSaleReceivableStatus(status: string): boolean {
  return (
    status === SALE_STATUS.PENDING ||
    status === SALE_STATUS.OVERDUE ||
    status === SALE_STATUS.PARTIAL ||
    status === SALE_STATUS.IN_PROGRESS
  );
}

export const SALE_RECEIVABLE_STATUSES = [
  SALE_STATUS.PENDING,
  SALE_STATUS.OVERDUE,
  SALE_STATUS.PARTIAL,
  SALE_STATUS.IN_PROGRESS,
] as const;

function toNumber(
  value: number | { toNumber?: () => number } | null | undefined,
): number {
  if (value == null) return 0;
  if (typeof value === "object" && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  return Number(value);
}

/**
 * Status to report for a stored row: Invoice payments are recalculated (Overdue
 * flips with the calendar), everything else keeps its stored status.
 */
export function resolveSaleInvoiceStatus(sale: {
  paymentType?: string | null;
  status?: string | null;
  invoiceAmountPaid?: unknown;
  /** @deprecated Prefer invoiceAmountPaid.total */
  invoicePaidAmount?: number | { toNumber?: () => number } | null;
  totalAmount: number | { toNumber?: () => number };
  invoiceDueDate?: Date | null;
}): string {
  if (sale.status === SALE_STATUS.CANCELLED) return SALE_STATUS.CANCELLED;
  if (sale.paymentType != null && !isInvoicePaymentType(sale.paymentType)) {
    return sale.status ?? SALE_STATUS.IN_PROGRESS;
  }
  const paid =
    sale.invoiceAmountPaid != null
      ? coerceInvoiceAmountPaid(sale.invoiceAmountPaid).total
      : toNumber(sale.invoicePaidAmount);
  return computeInvoicePaymentStatus({
    invoicePaidAmount: paid,
    amount: toNumber(sale.totalAmount),
    invoiceDueDate: sale.invoiceDueDate,
  });
}
