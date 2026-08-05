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
 * Sale / expense payment lifecycle (calculated from invoicePaidAmount + invoiceDueDate,
 * except CANCELLED which remains manual).
 */
export const SALE_STATUS = {
  /** @deprecated Prefer calculated Paid; kept for legacy rows / clients. */
  IN_PROGRESS: "IN_PROGRESS",
  /** @deprecated Prefer INVOICE_PAYMENT_STATUS.PAID ("Paid"). */
  PAID: "PAID",
  CANCELLED: "CANCELLED",
  PENDING: INVOICE_PAYMENT_STATUS.PENDING,
  OVERDUE: INVOICE_PAYMENT_STATUS.OVERDUE,
  PARTIAL: INVOICE_PAYMENT_STATUS.PARTIAL,
  /** Canonical paid label from invoice payment rules. */
  PAID_LABEL: INVOICE_PAYMENT_STATUS.PAID,
} as const;

export type SaleStatusValue = (typeof SALE_STATUS)[keyof typeof SALE_STATUS];

export function isInvoicePaymentType(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPE_INVOICE;
}

export function isCashPaymentType(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPE_CASH;
}

/** Card or bank transfer — historically async; status now derived from paid amount. */
export function isAsyncPaymentType(paymentType: string): boolean {
  return (
    paymentType === PAYMENT_TYPE_CARD || paymentType === PAYMENT_TYPE_TRANSFER
  );
}

/**
 * Initial stored status from payment type + amounts (Cash fully paid → Paid).
 */
export function initialSaleStatusForPaymentType(
  paymentType: string,
  opts?: {
    invoicePaidAmount?: number;
    totalAmount?: number;
    invoiceDueDate?: Date | null;
  },
): string {
  if (opts?.totalAmount != null) {
    return computeInvoicePaymentStatus({
      invoicePaidAmount: opts.invoicePaidAmount ?? 0,
      amount: opts.totalAmount,
      invoiceDueDate: opts.invoiceDueDate,
    });
  }
  if (isCashPaymentType(paymentType)) return INVOICE_PAYMENT_STATUS.PAID;
  return INVOICE_PAYMENT_STATUS.PENDING;
}

/** True if status means money fully collected. */
export function isSalePaidStatus(status: string): boolean {
  return (
    status === SALE_STATUS.PAID ||
    status === INVOICE_PAYMENT_STATUS.PAID ||
    status === "Paid"
  );
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

/** Resolve display/storage status for a sale row (preserves CANCELLED). */
export function resolveSaleInvoiceStatus(sale: {
  status?: string | null;
  invoicePaidAmount?: number | { toNumber?: () => number } | null;
  totalAmount: number | { toNumber?: () => number };
  amount?: number | { toNumber?: () => number };
  invoiceDueDate?: Date | null;
}): string {
  if (sale.status === SALE_STATUS.CANCELLED) return SALE_STATUS.CANCELLED;
  const paid = Number(
    typeof sale.invoicePaidAmount === "object" &&
      sale.invoicePaidAmount != null &&
      "toNumber" in sale.invoicePaidAmount
      ? (sale.invoicePaidAmount as { toNumber: () => number }).toNumber()
      : sale.invoicePaidAmount ?? 0,
  );
  const total = Number(
    typeof sale.totalAmount === "object" &&
      sale.totalAmount != null &&
      "toNumber" in sale.totalAmount
      ? (sale.totalAmount as { toNumber: () => number }).toNumber()
      : sale.totalAmount,
  );
  return computeInvoicePaymentStatus({
    invoicePaidAmount: paid,
    amount: total,
    invoiceDueDate: sale.invoiceDueDate,
  });
}
