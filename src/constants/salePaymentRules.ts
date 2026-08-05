import {
  computeInvoicePaymentStatus,
  INVOICE_PAYMENT_STATUS,
} from "./invoicePaymentStatus";

/** Matches mobile validation `paymentType` values. */
export const PAYMENT_TYPE_CASH = "Cash";
export const PAYMENT_TYPE_CARD = "Card";
export const PAYMENT_TYPE_TRANSFER = "Transfer";
export const PAYMENT_TYPE_INVOICE = "Invoice";

/**
 * Sale / expense payment lifecycle.
 * - Cash → PAID on create.
 * - Transfer / Card → IN_PROGRESS on create, confirmed to PAID via PATCH .../payment-status.
 * - Invoice → Pending / Partial / PAID / Overdue, always calculated from
 *   invoicePaidAmount, totalAmount and invoiceDueDate.
 * - CANCELLED is manual and never recalculated.
 */
export const SALE_STATUS = {
  IN_PROGRESS: "IN_PROGRESS",
  PAID: INVOICE_PAYMENT_STATUS.PAID,
  CANCELLED: "CANCELLED",
  PENDING: INVOICE_PAYMENT_STATUS.PENDING,
  OVERDUE: INVOICE_PAYMENT_STATUS.OVERDUE,
  PARTIAL: INVOICE_PAYMENT_STATUS.PARTIAL,
} as const;

export type SaleStatusValue = (typeof SALE_STATUS)[keyof typeof SALE_STATUS];

export function isInvoicePaymentType(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPE_INVOICE;
}

export function isCashPaymentType(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPE_CASH;
}

/** Card or bank transfer — payment confirmation is asynchronous. */
export function isAsyncPaymentType(paymentType: string): boolean {
  return (
    paymentType === PAYMENT_TYPE_CARD || paymentType === PAYMENT_TYPE_TRANSFER
  );
}

/**
 * Initial stored status on create:
 * - Invoice → calculated from invoicePaidAmount / totalAmount / invoiceDueDate
 * - Cash (or `fullyPaid`, e.g. bulk sales) → PAID
 * - Card / Transfer → IN_PROGRESS
 */
export function initialSaleStatusForPaymentType(
  paymentType: string,
  opts?: {
    invoicePaidAmount?: number;
    totalAmount?: number;
    invoiceDueDate?: Date | null;
    fullyPaid?: boolean;
  },
): string {
  if (isInvoicePaymentType(paymentType)) {
    return computeInvoicePaymentStatus({
      invoicePaidAmount: opts?.invoicePaidAmount ?? 0,
      amount: opts?.totalAmount ?? 0,
      invoiceDueDate: opts?.invoiceDueDate,
    });
  }
  if (opts?.fullyPaid) return SALE_STATUS.PAID;
  if (isCashPaymentType(paymentType)) return SALE_STATUS.PAID;
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
  invoicePaidAmount?: number | { toNumber?: () => number } | null;
  totalAmount: number | { toNumber?: () => number };
  invoiceDueDate?: Date | null;
}): string {
  if (sale.status === SALE_STATUS.CANCELLED) return SALE_STATUS.CANCELLED;
  if (sale.paymentType != null && !isInvoicePaymentType(sale.paymentType)) {
    return sale.status ?? SALE_STATUS.IN_PROGRESS;
  }
  return computeInvoicePaymentStatus({
    invoicePaidAmount: toNumber(sale.invoicePaidAmount),
    amount: toNumber(sale.totalAmount),
    invoiceDueDate: sale.invoiceDueDate,
  });
}
